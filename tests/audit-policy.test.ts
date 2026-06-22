import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { resolveAuditPolicy } from '../src/audit/config.js'
import { loadToolsList } from '../src/audit/loaders.js'
import { buildAuditReport } from '../src/audit/recommend.js'
import { runAuditMcpCommand } from '../src/commands/audit-mcp.js'

describe('audit policy and CI behavior', () => {
  it('applies profile defaults without requiring verbose trigger templates', async () => {
    const loaded = await loadToolsList('tests/fixtures/generic-mcp/tools-list.json')
    const production = buildAuditReport({
      tools: loaded.tools,
      logs: [],
      missedPrompts: [],
      policy: resolveAuditPolicy({ profile: 'production' })
    })
    const localDev = buildAuditReport({
      tools: loaded.tools,
      logs: [],
      missedPrompts: [],
      policy: resolveAuditPolicy({ profile: 'local-dev' })
    })

    const productionCreate = production.tools.find((tool) => tool.name === 'create_issue')
    const localCreate = localDev.tools.find((tool) => tool.name === 'create_issue')
    expect(productionCreate?.findings.map((finding) => finding.id)).toContain('unsafe_write_tool')
    expect(localCreate?.findings.map((finding) => finding.id)).not.toContain('unsafe_write_tool')
    expect(productionCreate?.findings.map((finding) => finding.id)).not.toContain('missing_trigger_language')
  })

  it('keeps catch-all tools visible in local-dev policy', () => {
    const report = buildAuditReport({
      tools: [
        {
          name: 'execute_js',
          description: 'Run JavaScript in the local development browser.',
          inputSchema: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'JavaScript source to run.' }
            },
            required: ['code']
          }
        }
      ],
      logs: [],
      missedPrompts: [],
      policy: resolveAuditPolicy({ profile: 'local-dev' })
    })

    expect(report.tools[0].findings).toMatchObject([{ id: 'catch_all_tool', severity: 'warn' }])
    expect(report.ci.status).toBe('pass')
  })

  it('returns a CI failure and writes artifacts when configured failures trigger', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mcplens-ci-'))
    try {
      const config = path.join(dir, 'mcplens.config.json')
      const baseline = path.join(dir, 'baseline.json')
      const md = path.join(dir, 'report.md')
      const json = path.join(dir, 'report.json')
      await writeFile(
        config,
        JSON.stringify(
          {
            profile: 'production',
            thresholds: { maxScoreDrop: 1, minToolScore: 50 }
          },
          null,
          2
        )
      )
      await writeFile(
        baseline,
        JSON.stringify(
          {
            summary: { averageScore: 100 },
            tools: [{ name: 'search_code', description: 'old', discoverabilityScore: 100 }]
          },
          null,
          2
        )
      )

      const exitCode = await runAuditMcpCommand({
        toolsList: 'tests/fixtures/generic-mcp/tools-list.json',
        config,
        baseline,
        out: md,
        json,
        ci: true,
        offline: true
      })

      expect(exitCode).toBe(1)
      await expect(readFile(md, 'utf8')).resolves.toContain('## Secondary Summary And CI Metadata')
      const parsed = JSON.parse(await readFile(json, 'utf8')) as {
        ci: { status: string; fail: number }
        baseline: { scoreDelta: number; newTools: string[] }
      }
      expect(parsed.ci.status).toBe('fail')
      expect(parsed.ci.fail).toBeGreaterThan(0)
      expect(parsed.baseline.scoreDelta).toBeLessThan(0)
      expect(parsed.baseline.newTools).toContain('delete_branch')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns success in warn-only CI mode while preserving fail findings in artifacts', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mcplens-ci-warn-only-'))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      const config = path.join(dir, 'mcplens.config.json')
      const baseline = path.join(dir, 'baseline.json')
      const md = path.join(dir, 'report.md')
      const json = path.join(dir, 'report.json')
      await writeFile(
        config,
        JSON.stringify(
          {
            profile: 'production',
            thresholds: { maxScoreDrop: 1, minToolScore: 50 }
          },
          null,
          2
        )
      )
      await writeFile(
        baseline,
        JSON.stringify(
          {
            summary: { averageScore: 100 },
            tools: [{ name: 'search_code', description: 'old', discoverabilityScore: 100 }]
          },
          null,
          2
        )
      )

      const exitCode = await runAuditMcpCommand({
        toolsList: 'tests/fixtures/generic-mcp/tools-list.json',
        config,
        baseline,
        out: md,
        json,
        ci: true,
        warnOnly: true,
        offline: true
      })

      expect(exitCode).toBe(0)
      const parsed = JSON.parse(await readFile(json, 'utf8')) as { ci: { status: string; fail: number } }
      expect(parsed.ci.status).toBe('fail')
      expect(parsed.ci.fail).toBeGreaterThan(0)
      const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n')
      expect(output).toContain('Mode: warn-only advisory')
      expect(output).toContain('WARN-ONLY would fail')
      await expect(readFile(md, 'utf8')).resolves.toContain('Strict CI Failures')
    } finally {
      logSpy.mockRestore()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
