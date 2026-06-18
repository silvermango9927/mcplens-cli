import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadAuditLogs, loadMissedPrompts, loadToolsList } from '../src/audit/loaders.js'
import { buildAuditReport } from '../src/audit/recommend.js'
import { renderMarkdownReport } from '../src/audit/report.js'
import { runAuditMcpCommand } from '../src/commands/audit-mcp.js'

describe('MCP activation audit report', () => {
  it('builds structured recommendations and markdown', async () => {
    const loaded = await loadToolsList('tests/fixtures/mcp-activation/tools-list.json')
    const logs = await loadAuditLogs('tests/fixtures/mcp-activation/events.jsonl')
    const prompts = await loadMissedPrompts('tests/fixtures/mcp-activation/missed-prompts.json')
    const report = buildAuditReport({ tools: loaded.tools, logs, missedPrompts: prompts, manifestBytes: loaded.manifestBytes })
    expect(report.summary.toolCount).toBe(13)
    expect(report.summary.workflowCount).toBeLessThan(report.summary.toolCount)
    expect(report.summary.topRecommendation).toMatch(/collapse|tools\/list|Rewrite/)
    expect(report.profiles.find((profile) => profile.name === 'core')?.tools).toContain('search_learnings')
    expect(report.hiddenTools.map((tool) => tool.tool)).toContain('confirm_compression')
    expect(report.recommendedTools.find((tool) => tool.currentName === 'submit_learning')).toMatchObject({
      recommendedName: 'draft_public_solution',
      priorityHint: 0.7
    })
    expect(report.missedPromptFindings).toHaveLength(2)

    const markdown = renderMarkdownReport(report)
    expect(markdown).toContain('# MCP Activation Audit')
    expect(markdown).toContain('## Privacy/Safety Friction Review')
    expect(markdown).toContain('draft_public_solution')
    expect(markdown).toContain('priorityHint')
  })

  it('writes markdown and JSON from the CLI command', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agentify-audit-'))
    try {
      const md = path.join(dir, 'activation-report.md')
      const json = path.join(dir, 'activation-report.json')
      await runAuditMcpCommand({
        toolsList: 'tests/fixtures/mcp-activation/tools-list.json',
        logs: 'tests/fixtures/mcp-activation/events.jsonl',
        missedPrompts: 'tests/fixtures/mcp-activation/missed-prompts.json',
        out: md,
        json,
        offline: true
      })
      await expect(readFile(md, 'utf8')).resolves.toContain('MCP Activation Audit')
      const parsed = JSON.parse(await readFile(json, 'utf8')) as { summary: { toolCount: number } }
      expect(parsed.summary.toolCount).toBe(13)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
