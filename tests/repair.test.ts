import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractErrorFiles, repairGeneratedProject, repairProject } from '../src/analyzer/repair.js'

describe('extractErrorFiles', () => {
  it('pulls unique TypeScript file paths from tsc output', () => {
    const output = [
      'src/tools/a.ts(3,1): error TS2304: Cannot find name x.',
      'src/tools/a.ts(9,2): error TS2304: Cannot find name y.',
      'src/lib/http.ts(1,1): error TS1005: ; expected.'
    ].join('\n')
    expect(extractErrorFiles(output)).toEqual(['src/tools/a.ts', 'src/lib/http.ts'])
  })
})

describe('repairProject', () => {
  it('sends failing files to the client and writes corrected contents', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agentify-repair-'))
    try {
      await mkdir(path.join(dir, 'src/tools'), { recursive: true })
      await writeFile(path.join(dir, 'src/tools/a.ts'), 'broken content')
      const fixed = await repairProject(dir, 'src/tools/a.ts(1,1): error TS1005: broken', {
        complete: async (_system, user) => {
          expect(user).toContain('broken content')
          return JSON.stringify([{ path: 'src/tools/a.ts', content: 'fixed content' }])
        }
      })
      expect(fixed).toEqual(['src/tools/a.ts'])
      await expect(readFile(path.join(dir, 'src/tools/a.ts'), 'utf8')).resolves.toBe('fixed content')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('refuses to write outside the project', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agentify-repair-'))
    try {
      await mkdir(path.join(dir, 'src'), { recursive: true })
      await writeFile(path.join(dir, 'src/a.ts'), 'broken content')
      await expect(
        repairProject(dir, 'src/a.ts(1,1): error TS1005: broken', {
          complete: async () => JSON.stringify([{ path: '../evil.ts', content: 'x' }])
        })
      ).rejects.toThrow(/outside/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('repairGeneratedProject', () => {
  it('does not attempt LLM repair without a key or injected client', async () => {
    const previous = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    try {
      const result = await repairGeneratedProject('/tmp/no-project', 'src/a.ts(1,1): error TS1005: broken')
      expect(result).toMatchObject({ repaired: false, files: [] })
      expect(result.reason).toMatch(/ANTHROPIC_API_KEY/)
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = previous
    }
  })
})
