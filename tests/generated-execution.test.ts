import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { describe, expect, it } from 'vitest'
import { generateProject } from '../src/codegen/generate.js'
import { ManifestSchema } from '../src/manifest/schema.js'
import { readJsonFile } from '../src/util/fs.js'

describe('generated MCP server execution', () => {
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

  it('sends generated body params as a JSON request body', async () => {
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
            name: 'create_issue',
            description: 'Create an issue',
            params: [
              { name: 'owner', in: 'path', type: 'string', required: true, description: 'Repository owner' },
              { name: 'repo', in: 'path', type: 'string', required: true, description: 'Repository name' },
              { name: 'title', in: 'body', type: 'string', required: true, description: 'Issue title' },
              { name: 'body', in: 'body', type: 'string', required: false, description: 'Issue body' },
              { name: 'labels', in: 'body', type: 'string[]', required: false, description: 'Issue labels' }
            ],
            requests: [{ key: 'main', method: 'POST', path: '/repos/{owner}/{repo}/issues' }],
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

      mockServer = await startMockGitHubLite(observedRequest)
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
        name: 'create_issue',
        arguments: {
          owner: 'octo-org',
          repo: 'hello-world',
          title: 'Bug report',
          body: 'Steps to reproduce',
          labels: ['bug', 'triage']
        }
      })
      expect(result.structuredContent).toEqual({ number: 42, title: 'Bug report' })
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

function startMockGitHubLite(observedRequest: { contentType?: string | string[]; body?: unknown }): Promise<Server> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method === 'POST' && url.pathname === '/repos/octo-org/hello-world/issues') {
      observedRequest.contentType = req.headers['content-type']
      let raw = ''
      req.on('data', (chunk) => {
        raw += chunk.toString()
      })
      req.on('end', () => {
        observedRequest.body = JSON.parse(raw)
        res.statusCode = 201
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ number: 42, title: 'Bug report', state: 'open' }))
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
