import { spawn } from 'node:child_process'
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
        env: {
          ...stringEnv(process.env),
          AGENTIFY_BASE_URL: `http://127.0.0.1:${address.port}`,
          TRACKLY_API_TOKEN: 'test-token'
        }
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

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}
