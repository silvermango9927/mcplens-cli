import { describe, expect, it } from 'vitest'
import { loadAuditLogs, loadMissedPrompts, loadToolsList } from '../src/audit/loaders.js'
import { auditTools, buildWorkflowAudits, summarizeUsage, workflowName } from '../src/audit/scoring.js'

describe('audit scoring', () => {
  it('groups confirmation fanout into workflows', () => {
    expect(workflowName('submit_learning')).toBe('learning_contribution')
    expect(workflowName('confirm_learning')).toBe('learning_contribution')
    expect(workflowName('reject_learning')).toBe('learning_contribution')
    expect(workflowName('get_compression_candidates')).toBe('compression')
    expect(workflowName('confirm_delete_addendum')).toBe('delete_addendum')
  })

  it('scores weak contribution tools and summarizes activation metrics', async () => {
    const { tools } = await loadToolsList('tests/fixtures/mcp-activation/tools-list.json')
    const logs = await loadAuditLogs('tests/fixtures/mcp-activation/events.jsonl')
    const prompts = await loadMissedPrompts('tests/fixtures/mcp-activation/missed-prompts.json')
    const audits = auditTools(tools, logs, prompts)
    const submit = audits.find((tool) => tool.name === 'submit_learning')
    const search = audits.find((tool) => tool.name === 'search_open_issues')
    expect(submit?.discoverabilityScore).toBeLessThan(60)
    expect(submit?.issues.join('\n')).toMatch(/Use when|too short|safety/)
    expect(search?.discoverabilityScore).toBeGreaterThan(submit?.discoverabilityScore ?? 100)

    const workflows = buildWorkflowAudits(audits)
    const learning = workflows.find((workflow) => workflow.name === 'learning_contribution')
    expect(learning?.toolNames).toEqual(['confirm_learning', 'reject_learning', 'submit_learning'])
    expect(learning?.helperToolCount).toBe(2)

    const usage = summarizeUsage(logs)
    expect(usage.initializedSessions).toBe(3)
    expect(usage.sessionsWithToolCall).toBe(2)
    expect(usage.activationRate).toBe(66.7)
    expect(usage.draftCreatedEvents).toBe(1)
    expect(usage.publicPostEvents).toBeUndefined()
  })
})
