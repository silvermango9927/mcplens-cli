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
      await expect(readFile(path.join(dir, 'src/tools/get_issue.ts'), 'utf8')).resolves.toContain('applyResponseMap')
      await expect(readFile(path.join(dir, 'README.md'), 'utf8')).resolves.toContain('TRACKLY_API_TOKEN')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
