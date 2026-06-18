import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateProject } from '../src/codegen/generate.js'
import { ManifestSchema } from '../src/manifest/schema.js'
import { readJsonFile } from '../src/util/fs.js'

describe('generateProject', () => {
  it('writes a standalone TypeScript MCP project', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agentify-codegen-'))
    try {
      const manifest = ManifestSchema.parse(await readJsonFile('tests/fixtures/trackly.manifest.json'))
      await generateProject(manifest, dir)
      await expect(readFile(path.join(dir, 'src/index.ts'), 'utf8')).resolves.toContain('registerGetIssue(server)')
      await expect(readFile(path.join(dir, 'src/lib/config.ts'), 'utf8')).resolves.toContain('TRACKLY_API_TOKEN')
      await expect(readFile(path.join(dir, 'src/lib/config.ts'), 'utf8')).resolves.toContain('MCP_TRANSPORT')
      await expect(readFile(path.join(dir, 'src/lib/config.ts'), 'utf8')).resolves.toContain('AGENTIFY_BASE_URL')
      await expect(readFile(path.join(dir, 'src/tools/get_issue.ts'), 'utf8')).resolves.toContain('applyResponseMap')
      const readme = await readFile(path.join(dir, 'README.md'), 'utf8')
      expect(readme).toContain('## Runtime Environment')
      expect(readme).toContain('`MCP_TRANSPORT`')
      expect(readme).toContain('`AGENTIFY_BASE_URL`')
      expect(readme).toContain('TRACKLY_API_TOKEN')
      expect(readme).toContain('## Stdio Mode')
      expect(readme).toContain('"command": "node"')
      expect(readme).toContain('## Streamable HTTP Mode')
      expect(readme).toContain('Authorization: Bearer $MCP_HTTP_TOKEN')
      expect(readme).toContain('Do not expose `/mcp` on the public internet')
      expect(readme).toContain('## Docker Compose')
      expect(readme).toContain('docker compose up --build')

      const activation = JSON.parse(await readFile(path.join(dir, 'mcp-activation.json'), 'utf8'))
      expect(activation).toMatchObject({
        agentifyActivationVersion: 1,
        serverName: 'trackly',
        displayName: 'Trackly MCP',
        projectDir: dir,
        stdio: {
          command: 'node',
          args: [path.join(dir, 'dist/index.js')],
          env: { TRACKLY_API_TOKEN: '<TRACKLY_API_TOKEN>' }
        },
        streamableHttp: {
          url: 'http://127.0.0.1:3000/mcp',
          healthUrl: 'http://127.0.0.1:3000/healthz'
        }
      })
      expect(activation.claudeCode.command).toBe(
        `claude mcp add trackly --env TRACKLY_API_TOKEN="$TRACKLY_API_TOKEN" -- node ${path.join(dir, 'dist/index.js')}`
      )

      const clientConfig = JSON.parse(await readFile(path.join(dir, 'mcp-client.config.json'), 'utf8'))
      expect(clientConfig).toEqual({
        mcpServers: {
          trackly: {
            command: 'node',
            args: [path.join(dir, 'dist/index.js')],
            env: { TRACKLY_API_TOKEN: '<TRACKLY_API_TOKEN>' }
          }
        }
      })

      const activationGuide = await readFile(path.join(dir, 'ACTIVATE.md'), 'utf8')
      expect(activationGuide).toContain('# Activate Trackly MCP')
      expect(activationGuide).toContain('mcp-client.config.json')
      expect(activationGuide).toContain('claude mcp add trackly')
      expect(activationGuide).toContain(path.join(dir, 'dist/index.js'))

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
      expect(compose).toContain('TRACKLY_API_TOKEN: ${TRACKLY_API_TOKEN:?set TRACKLY_API_TOKEN in .env}')
      expect(compose).toContain('"3000:3000"')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('includes JSON body params in generated tool schemas and request metadata', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agentify-codegen-body-'))
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
            responseMap: [{ from: 'number', to: 'number', reason: 'Issue number' }]
          }
        ],
        hiddenEndpoints: []
      })
      await generateProject(manifest, dir)

      const source = await readFile(path.join(dir, 'src/tools/create_issue.ts'), 'utf8')
      expect(source).toContain('"in": "body"')
      expect(source).toContain('"title": z.string().describe("Issue title")')
      expect(source).toContain('"body": z.string().describe("Issue body").optional()')
      expect(source).toContain('"labels": z.array(z.string()).describe("Issue labels").optional()')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
