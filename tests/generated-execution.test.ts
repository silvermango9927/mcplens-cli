import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { describe, expect, it } from 'vitest'
import { generateProject } from '../src/codegen/generate.js'
import { ManifestSchema } from '../src/manifest/schema.js'
import { readJsonFile } from '../src/util/fs.js'

describe('generated MCP server execution', () => {
  it('emits generated self-hosting artifacts with expected runtime env vars', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agentify-generated-artifacts-'))

    try {
      const manifest = ManifestSchema.parse(await readJsonFile('tests/fixtures/trackly.manifest.json'))
      await generateProject(manifest, dir)

      const envExample = await readFile(path.join(dir, '.env.example'), 'utf8')
      expect(envExample).toContain('MCP_TRANSPORT=http')
      expect(envExample).toContain('HOST=0.0.0.0')
      expect(envExample).toContain('PORT=3000')
      expect(envExample).toContain('MCP_HTTP_TOKEN=change-me')
      expect(envExample).toContain('AGENTIFY_BASE_URL=https://api.trackly.example')
      expect(envExample).toContain('TRACKLY_API_TOKEN=')

      const dockerfile = await readFile(path.join(dir, 'Dockerfile'), 'utf8')
      expect(dockerfile).toContain('FROM node:20-slim AS build')
      expect(dockerfile).toContain('FROM node:20-slim AS runtime')
      expect(dockerfile).toContain('RUN npm run build')
      expect(dockerfile).toContain('RUN npm install --omit=dev')
      expect(dockerfile).toContain('EXPOSE 3000')

      const compose = await readFile(path.join(dir, 'docker-compose.yml'), 'utf8')
      expect(compose).toContain('env_file:')
      expect(compose).toContain('- .env')
      expect(compose).toContain('MCP_TRANSPORT: ${MCP_TRANSPORT:-http}')
      expect(compose).toContain('MCP_HTTP_TOKEN: ${MCP_HTTP_TOKEN:?set MCP_HTTP_TOKEN in .env}')
      expect(compose).toContain('AGENTIFY_BASE_URL: ${AGENTIFY_BASE_URL:?set AGENTIFY_BASE_URL in .env}')
      expect(compose).toContain('TRACKLY_API_TOKEN: ${TRACKLY_API_TOKEN:?set TRACKLY_API_TOKEN in .env}')
      expect(compose).toContain('"3000:3000"')

      const activation = JSON.parse(await readFile(path.join(dir, 'mcp-activation.json'), 'utf8'))
      expect(activation.stdio).toMatchObject({
        command: 'node',
        args: [path.join(dir, 'dist/index.js')],
        env: { TRACKLY_API_TOKEN: '<TRACKLY_API_TOKEN>' }
      })
      expect(activation.claudeCode.command).toContain('claude mcp add trackly')

      const clientConfig = await readFile(path.join(dir, 'mcp-client.config.json'), 'utf8')
      expect(clientConfig).toContain('"mcpServers"')
      expect(clientConfig).toContain(path.join(dir, 'dist/index.js'))

      const activationGuide = await readFile(path.join(dir, 'ACTIVATE.md'), 'utf8')
      expect(activationGuide).toContain('## 3. Activate In A Local MCP Client')
      expect(activationGuide).toContain('Authorization: Bearer $MCP_HTTP_TOKEN')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('calls a mocked upstream and returns lean structured content', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agentify-generated-exec-'))
    const sample = await readJsonFile<{ response: unknown }>('tests/fixtures/bloated-api/samples/get-issue.json')
    let mockServer: Server | undefined
    const client = new Client({ name: 'agentify-test-client', version: '0.1.0' })

    try {
      const manifest = ManifestSchema.parse(await readJsonFile('tests/fixtures/trackly.manifest.json'))
      await generateProject(manifest, dir)
      await run('npm', ['install', '--silent'], dir)
      await run('npm', ['run', 'build'], dir)

      mockServer = await startMockTrackly(sample.response)
      const address = mockServer.address()
      if (!address || typeof address === 'string') throw new Error('Mock server did not bind to a port')

      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [path.join(dir, 'dist/index.js')],
        cwd: dir,
        stderr: 'pipe',
        env: generatedEnv({
          AGENTIFY_BASE_URL: `http://127.0.0.1:${address.port}`,
          TRACKLY_API_TOKEN: 'test-token'
        })
      })
      await client.connect(transport)

      const result = await client.callTool({ name: 'get_issue', arguments: { id: 'ISS-123' } })
      expect(result.structuredContent).toEqual({
        id: 'ISS-123',
        key: 'TRACK-123',
        summary: 'Checkout fails for annual plans',
        status: 'In Progress',
        description: 'Payment form errors after plan switch.',
        assignee_name: 'Priya Shah',
        updated: '2026-06-10T09:30:00Z'
      })
    } finally {
      await client.close().catch(() => undefined)
      await new Promise<void>((resolve) => mockServer?.close(() => resolve()) ?? resolve())
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)

  it('fails fast with a clear error when required upstream auth is missing', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agentify-generated-missing-auth-'))

    try {
      const manifest = ManifestSchema.parse(await readJsonFile('tests/fixtures/trackly.manifest.json'))
      await generateProject(manifest, dir)
      await run('npm', ['install', '--silent'], dir)
      await run('npm', ['run', 'build'], dir)

      const result = await runForExit(process.execPath, [path.join(dir, 'dist/index.js')], dir, generatedEnv({
        AGENTIFY_BASE_URL: 'http://127.0.0.1:1'
      }))

      expect(result.code).toBe(1)
      expect(result.output).toContain('Invalid runtime configuration')
      expect(result.output).toContain('missing required env var TRACKLY_API_TOKEN')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)

  for (const testCase of [
    {
      method: 'POST' as const,
      toolName: 'create_issue',
      requestPathTemplate: '/repos/{owner}/{repo}/issues',
      observedPath: '/repos/octo-org/hello-world/issues',
      params: [],
      args: {},
      upstreamResponse: { number: 42, title: 'Bug report', state: 'open' },
      expectedContent: { number: 42, title: 'Bug report' }
    },
    {
      method: 'PATCH' as const,
      toolName: 'update_issue',
      requestPathTemplate: '/repos/{owner}/{repo}/issues/{issue_number}',
      observedPath: '/repos/octo-org/hello-world/issues/42',
      params: [
        { name: 'issue_number', in: 'path' as const, type: 'number' as const, required: true, description: 'Issue number' }
      ],
      args: { issue_number: 42 },
      upstreamResponse: { number: 42, title: 'Updated title', state: 'open' },
      expectedContent: { number: 42, title: 'Updated title' }
    }
  ]) {
    it(`sends generated ${testCase.method} body params as a JSON request body`, async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'agentify-generated-body-exec-'))
      let mockServer: Server | undefined
      const observedRequest: { contentType?: string | string[]; body?: unknown } = {}
      const client = new Client({ name: 'agentify-test-client', version: '0.1.0' })

      try {
        const manifest = ManifestSchema.parse({
          agentifyVersion: 1,
          api: { name: 'GitHub Lite', baseUrl: 'https://api.github.example', auth: { type: 'none' } },
          tools: [
            {
              name: testCase.toolName,
              description: 'Create or update an issue',
              params: [
                { name: 'owner', in: 'path', type: 'string', required: true, description: 'Repository owner' },
                { name: 'repo', in: 'path', type: 'string', required: true, description: 'Repository name' },
                ...testCase.params,
                { name: 'title', in: 'body', type: 'string', required: true, description: 'Issue title' },
                { name: 'body', in: 'body', type: 'string', required: false, description: 'Issue body' },
                { name: 'labels', in: 'body', type: 'string[]', required: false, description: 'Issue labels' }
              ],
              requests: [{ key: 'main', method: testCase.method, path: testCase.requestPathTemplate }],
              responseMap: [
                { from: 'number', to: 'number', reason: 'Issue number' },
                { from: 'title', to: 'title', reason: 'Issue title' }
              ]
            }
          ],
          hiddenEndpoints: []
        })
        await generateProject(manifest, dir)
        await run('npm', ['install', '--silent'], dir)
        await run('npm', ['run', 'build'], dir)

        mockServer = await startMockJsonEndpoint({
          method: testCase.method,
          path: testCase.observedPath,
          responseBody: testCase.upstreamResponse,
          observedRequest
        })
        const address = mockServer.address()
        if (!address || typeof address === 'string') throw new Error('Mock server did not bind to a port')

        const transport = new StdioClientTransport({
          command: process.execPath,
          args: [path.join(dir, 'dist/index.js')],
          cwd: dir,
          stderr: 'pipe',
          env: generatedEnv({
            AGENTIFY_BASE_URL: `http://127.0.0.1:${address.port}`
          })
        })
        await client.connect(transport)

        const result = await client.callTool({
          name: testCase.toolName,
          arguments: {
            owner: 'octo-org',
            repo: 'hello-world',
            ...testCase.args,
            title: 'Bug report',
            body: 'Steps to reproduce',
            labels: ['bug', 'triage']
          }
        })
        expect(result.structuredContent).toEqual(testCase.expectedContent)
        expect(observedRequest.contentType).toContain('application/json')
        expect(observedRequest.body).toEqual({
          title: 'Bug report',
          body: 'Steps to reproduce',
          labels: ['bug', 'triage']
        })
      } finally {
        await client.close().catch(() => undefined)
        await new Promise<void>((resolve) => mockServer?.close(() => resolve()) ?? resolve())
        await rm(dir, { recursive: true, force: true })
      }
    }, 120_000)
  }

  it('protects Streamable HTTP with bearer auth and exposes health probes', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agentify-generated-http-'))
    let httpServer: GeneratedHttpServer | undefined

    try {
      const manifest = ManifestSchema.parse(await readJsonFile('tests/fixtures/trackly.manifest.json'))
      await generateProject(manifest, dir)
      await run('npm', ['install', '--silent'], dir)
      await run('npm', ['run', 'build'], dir)

      await expect(runGeneratedHttpWithoutToken(dir)).resolves.toContain('missing required env var MCP_HTTP_TOKEN')

      httpServer = await startGeneratedHttpServer(dir, {
        MCP_HTTP_TOKEN: 'test-http-token',
        TRACKLY_API_TOKEN: 'test-token'
      })

      await expect(fetchJson(`${httpServer.baseUrl}/healthz`)).resolves.toMatchObject({
        status: 200,
        body: { ok: true }
      })
      await expect(fetchJson(`${httpServer.baseUrl}/readyz`)).resolves.toMatchObject({
        status: 200,
        body: { ok: true }
      })

      const initializeRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'agentify-http-test', version: '0.1.0' }
        }
      }

      await expect(postMcpInitialize(httpServer.baseUrl, initializeRequest)).resolves.toMatchObject({
        status: 401,
        body: { error: { message: 'Unauthorized' }, id: 1 }
      })
      await expect(postMcpInitialize(httpServer.baseUrl, initializeRequest, 'wrong-token')).resolves.toMatchObject({
        status: 401,
        body: { error: { message: 'Unauthorized' }, id: 1 }
      })

      const authorized = await postMcpInitialize(httpServer.baseUrl, initializeRequest, 'test-http-token')
      expect(authorized.status).toBe(200)
      expect(authorized.body).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        result: {
          serverInfo: { name: 'Trackly MCP', version: '0.1.0' }
        }
      })
    } finally {
      await stopGeneratedHttpServer(httpServer)
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)

  const dockerE2E = process.env.AGENTIFY_DOCKER_E2E === '1' ? it : it.skip
  dockerE2E('builds and runs the generated Docker image with HTTP readiness probes', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agentify-generated-docker-'))
    const imageName = `agentify-generated-e2e:${process.pid}-${Date.now()}`
    let containerId: string | undefined

    try {
      const manifest = ManifestSchema.parse(await readJsonFile('tests/fixtures/trackly.manifest.json'))
      await generateProject(manifest, dir)
      await run('docker', ['build', '-t', imageName, '.'], dir)

      containerId = (await runCapture('docker', [
        'run',
        '--rm',
        '-d',
        '-p',
        '127.0.0.1::3000',
        '-e',
        'MCP_TRANSPORT=http',
        '-e',
        'HOST=0.0.0.0',
        '-e',
        'PORT=3000',
        '-e',
        'MCP_HTTP_TOKEN=test-http-token',
        '-e',
        'AGENTIFY_BASE_URL=http://127.0.0.1:1',
        '-e',
        'TRACKLY_API_TOKEN=test-token',
        imageName
      ], dir)).trim()

      const port = parseDockerPublishedPort(await runCapture('docker', ['port', containerId, '3000/tcp'], dir))
      const baseUrl = `http://127.0.0.1:${port}`
      await waitForUrl(`${baseUrl}/healthz`)

      await expect(fetchJson(`${baseUrl}/healthz`)).resolves.toMatchObject({
        status: 200,
        body: { ok: true }
      })
      await expect(fetchJson(`${baseUrl}/readyz`)).resolves.toMatchObject({
        status: 200,
        body: { ok: true }
      })
    } finally {
      if (containerId) await runForExit('docker', ['rm', '-f', containerId], dir, stringEnv(process.env))
      await runForExit('docker', ['image', 'rm', '-f', imageName], dir, stringEnv(process.env))
      await rm(dir, { recursive: true, force: true })
    }
  }, 240_000)
})

function startMockTrackly(responseBody: unknown): Promise<Server> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method === 'GET' && url.pathname === '/issues/ISS-123') {
      expect(req.headers.authorization).toBe('Bearer test-token')
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(responseBody))
      return
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'not found' }))
  })
  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function startMockJsonEndpoint(options: {
  method: string
  path: string
  responseBody: unknown
  observedRequest: { contentType?: string | string[]; body?: unknown }
}): Promise<Server> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method === options.method && url.pathname === options.path) {
      options.observedRequest.contentType = req.headers['content-type']
      let raw = ''
      req.on('data', (chunk) => {
        raw += chunk.toString()
      })
      req.on('end', () => {
        options.observedRequest.body = JSON.parse(raw)
        res.statusCode = 201
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(options.responseBody))
      })
      return
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'not found' }))
  })
  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} failed with ${code}\n${output}`))
    })
    child.on('error', reject)
  })
}

function runCapture(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`${command} ${args.join(' ')} failed with ${code}\n${stdout}${stderr}`))
    })
    child.on('error', reject)
  })
}

function runForExit(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string>
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('close', (code) => resolve({ code, output }))
    child.on('error', reject)
  })
}

type GeneratedHttpServer = {
  baseUrl: string
  child: ChildProcessWithoutNullStreams
  output: () => string
}

async function startGeneratedHttpServer(dir: string, env: Record<string, string>): Promise<GeneratedHttpServer> {
  const port = await getFreePort()
  const child = spawn(process.execPath, [path.join(dir, 'dist/index.js')], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: generatedEnv({
      ...env,
      MCP_TRANSPORT: 'http',
      PORT: String(port)
    })
  })
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })
  const server = { baseUrl: `http://127.0.0.1:${port}`, child, output: () => output }
  await waitForHttpServer(server)
  return server
}

async function runGeneratedHttpWithoutToken(dir: string): Promise<string> {
  const port = await getFreePort()
  return runForExit(process.execPath, [path.join(dir, 'dist/index.js')], dir, generatedEnv({
    MCP_TRANSPORT: 'http',
    PORT: String(port),
    TRACKLY_API_TOKEN: 'test-token'
  })).then((result) => {
    if (result.code === 0) throw new Error(`Generated HTTP server exited successfully without MCP_HTTP_TOKEN\n${result.output}`)
    return result.output
  })
}

async function waitForHttpServer(server: GeneratedHttpServer): Promise<void> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) throw new Error(`Generated HTTP server exited early\n${server.output()}`)
    try {
      const response = await fetch(`${server.baseUrl}/healthz`)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await delay(50)
  }
  throw new Error(`Timed out waiting for generated HTTP server\n${server.output()}`)
}

async function waitForUrl(url: string): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function stopGeneratedHttpServer(server: GeneratedHttpServer | undefined): Promise<void> {
  if (!server) return
  if (server.child.exitCode !== null) return
  server.child.kill()
  await new Promise<void>((resolve) => server.child.once('close', () => resolve()))
}

function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  return fetch(url).then(async (response) => ({
    status: response.status,
    body: await response.json()
  }))
}

async function postMcpInitialize(
  baseUrl: string,
  body: unknown,
  token?: string
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })
  return {
    status: response.status,
    body: await response.json()
  }
}

function getFreePort(): Promise<number> {
  const server = createServer()
  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not allocate a test port')))
        return
      }
      server.close(() => resolve(address.port))
    })
  })
}

function parseDockerPublishedPort(output: string): number {
  const match = output.match(/:(\d+)\s*$/)
  if (!match) throw new Error(`Could not parse Docker published port from: ${output}`)
  return Number(match[1])
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function generatedEnv(overrides: Record<string, string>): Record<string, string> {
  const env = stringEnv(process.env)
  for (const key of ['MCP_TRANSPORT', 'HOST', 'PORT', 'MCP_HTTP_TOKEN', 'AGENTIFY_BASE_URL', 'TRACKLY_API_TOKEN']) {
    delete env[key]
  }
  return { ...env, ...overrides }
}

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}
