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
      await expect(readFile(path.join(dir, 'README.md'), 'utf8')).resolves.toContain('TRACKLY_API_TOKEN')
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
