import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildAuditCapabilities } from '../src/audit/capabilities.js'
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
      advisoryPriority: 0.7
    })
    expect(report.missedPromptFindings).toHaveLength(2)

    // Fix 3(b): the markdown report and the capabilities plan must agree on what "core" means.
    // Core profile = every non-admin tool; default-visible + contextual helpers must sum to it.
    const coreProfile = report.profiles.find((profile) => profile.name === 'core')
    expect(report.summary.coreProfileToolCount).toBe(coreProfile?.tools.length)
    expect((report.summary.recommendedToolCount ?? 0) + (report.summary.contextualToolCount ?? 0)).toBe(
      report.summary.coreProfileToolCount
    )
    // Confirm/reject helpers live in the core profile (not admin), but are exposed contextually.
    expect(coreProfile?.tools).toContain('confirm_learning')

    const markdown = renderMarkdownReport(report)
    expect(markdown).toContain('# MCP Activation Audit')
    expect(markdown).toContain('## Privacy/Safety Friction Review')
    expect(markdown).toContain('draft_public_solution')
    // Fix 3(a): advisory priority must be framed as a non-standard hint, not a real annotation.
    expect(markdown).toContain('advisory priority (non-standard MCP hint')

    const capabilities = buildAuditCapabilities(report)
    expect(capabilities.agentifyCapabilitiesVersion).toBe(1)
    expect(capabilities.profiles.find((profile) => profile.name === 'core')?.tools).toContain('draft_public_solution')
    expect(capabilities.tools.find((tool) => tool.currentName === 'submit_learning')).toMatchObject({
      name: 'draft_public_solution',
      exposure: 'default',
      advisoryPriority: 0.7,
      annotations: { readOnlyHint: false }
    })
    expect(capabilities.tools.find((tool) => tool.currentName === 'confirm_compression')).toMatchObject({
      exposure: 'contextual'
    })
    expect(capabilities.instrumentationEvents).toContain('policy_block')

    // Fix 3(a): read tools advertise the real, spec-defined MCP annotations.
    expect(capabilities.tools.find((tool) => tool.currentName === 'search_learnings')?.annotations).toMatchObject({
      readOnlyHint: true,
      idempotentHint: true
    })
    // Fix 3(a): the plan must explicitly disclaim advisoryPriority as non-standard.
    expect(capabilities.notes.join('\n')).toMatch(/advisoryPriority.*not a standard MCP annotation/i)

    // Fix 3(b): markdown report and capabilities plan agree on core / default / admin counts.
    expect(capabilities.summary.coreToolCount).toBe(report.summary.coreProfileToolCount)
    expect(capabilities.summary.defaultToolCount).toBe(report.summary.recommendedToolCount)
    expect(capabilities.summary.adminToolCount).toBe(report.summary.adminProfileToolCount)
  })

  it('writes markdown, JSON, and capabilities from the CLI command', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agentify-audit-'))
    try {
      const md = path.join(dir, 'activation-report.md')
      const json = path.join(dir, 'activation-report.json')
      const capabilities = path.join(dir, 'mcp-capabilities.json')
      await runAuditMcpCommand({
        toolsList: 'tests/fixtures/mcp-activation/tools-list.json',
        logs: 'tests/fixtures/mcp-activation/events.jsonl',
        missedPrompts: 'tests/fixtures/mcp-activation/missed-prompts.json',
        out: md,
        json,
        capabilities,
        offline: true
      })
      await expect(readFile(md, 'utf8')).resolves.toContain('MCP Activation Audit')
      const parsed = JSON.parse(await readFile(json, 'utf8')) as { summary: { toolCount: number } }
      expect(parsed.summary.toolCount).toBe(13)
      const parsedCapabilities = JSON.parse(await readFile(capabilities, 'utf8')) as { agentifyCapabilitiesVersion: number }
      expect(parsedCapabilities.agentifyCapabilitiesVersion).toBe(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
