import { describe, expect, it } from 'vitest'
import { buildAuditCapabilities } from '../src/audit/capabilities.js'
import { loadToolsList } from '../src/audit/loaders.js'
import { buildAuditReport } from '../src/audit/recommend.js'
import { renderMarkdownReport } from '../src/audit/report.js'
import { classifyRole } from '../src/audit/scoring.js'

// The audit engine must work on ANY MCP server, not just the "shared learnings" example.
// This fixture is a GitHub-style devtools server with no learnings/contribution concepts.
describe('audit works on a generic (non-learnings) MCP server', () => {
  it('classifies roles, stays coherent, and emits spec-compliant annotations', async () => {
    const loaded = await loadToolsList('tests/fixtures/generic-mcp/tools-list.json')
    const report = buildAuditReport({ tools: loaded.tools, logs: [], missedPrompts: [], manifestBytes: loaded.manifestBytes })

    const byName = new Map(report.tools.map((tool) => [tool.name, tool]))
    // Structural role classification generalizes across domains.
    expect(byName.get('search_code')?.role).toBe('read')
    expect(byName.get('delete_branch')?.role).toBe('destructive')
    expect(byName.get('create_issue')?.role).toBe('write')
    expect(classifyRole('git_status', { readOnlyHint: true })).toBe('read')
    expect(classifyRole('git_reset', { destructiveHint: true })).toBe('destructive')
    // Description quality scoring is domain-independent: a strong read tool beats a bare write tool.
    expect(byName.get('search_code')?.discoverabilityScore).toBeGreaterThan(
      byName.get('create_issue')?.discoverabilityScore ?? 100
    )
    expect(byName.get('create_issue')?.findings.map((finding) => finding.id)).toContain('unsafe_write_tool')

    // Fix 3(b): report and capabilities agree on core/default/admin for a brand-new domain.
    const capabilities = buildAuditCapabilities(report)
    expect(capabilities.summary.coreToolCount).toBe(report.summary.coreProfileToolCount)
    expect(capabilities.summary.defaultToolCount).toBe(report.summary.recommendedToolCount)
    expect(capabilities.summary.adminToolCount).toBe(report.summary.adminProfileToolCount)
    // delete_branch is the only admin/destructive tool here.
    expect(report.profiles.find((profile) => profile.name === 'admin')?.tools).toEqual(['delete_branch'])

    // Fix 3(a): role-appropriate standard MCP annotations on any server.
    expect(capabilities.tools.find((tool) => tool.currentName === 'search_code')?.annotations).toMatchObject({
      readOnlyHint: true,
      idempotentHint: true
    })
    expect(capabilities.tools.find((tool) => tool.currentName === 'delete_branch')?.annotations).toMatchObject({
      destructiveHint: true
    })

    // Generic tools without a domain-specific rewrite still get a usable "Use when:" template.
    const markdown = renderMarkdownReport(report)
    expect(markdown).toContain('# MCP Activation Audit')
    expect(markdown).not.toContain('Extra confirmation/posting steps may reduce activation')
    expect(report.recommendedTools.find((tool) => tool.currentName === 'get_pull_request')?.recommendedDescription).toContain(
      'Use when:'
    )
  })
})
