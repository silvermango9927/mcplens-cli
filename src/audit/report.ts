import { ActivationAuditReport } from './schema.js'

export function renderMarkdownReport(report: ActivationAuditReport): string {
  const lines: string[] = []
  lines.push('# MCP Activation Audit')
  lines.push('')
  lines.push('## Executive Summary')
  lines.push('')
  lines.push(`- Tools exposed: ${report.summary.toolCount}`)
  lines.push(`- Default-visible tools (shown in every session): ${report.summary.recommendedToolCount}`)
  if (report.summary.coreProfileToolCount !== undefined) {
    lines.push(
      `- Core profile: ${report.summary.coreProfileToolCount} (${report.summary.recommendedToolCount} default-visible + ${report.summary.contextualToolCount ?? 0} contextual helpers)`
    )
  }
  if (report.summary.adminProfileToolCount !== undefined) {
    lines.push(`- Admin profile (kept out of the default surface): ${report.summary.adminProfileToolCount}`)
  }
  if (report.summary.workflowCount !== undefined) lines.push(`- Workflow groups: ${report.summary.workflowCount}`)
  if (report.summary.manifestBytes !== undefined) lines.push(`- tools/list payload: ${formatBytes(report.summary.manifestBytes)}`)
  if (report.summary.confirmRejectToolCount !== undefined) {
    const pct = report.summary.toolCount > 0 ? Math.round((report.summary.confirmRejectToolCount / report.summary.toolCount) * 100) : 0
    lines.push(`- Confirm/reject helpers: ${report.summary.confirmRejectToolCount} (${pct}%)`)
  }
  if (report.summary.initializedSessions !== undefined) lines.push(`- Initialized sessions: ${report.summary.initializedSessions}`)
  if (report.summary.sessionsWithToolCall !== undefined) lines.push(`- Sessions with tool calls: ${report.summary.sessionsWithToolCall}`)
  if (report.summary.activationRate !== undefined) lines.push(`- Tool-call activation rate: ${report.summary.activationRate}%`)
  lines.push(`- Top recommendation: ${report.summary.topRecommendation}`)
  lines.push('')

  lines.push('## Activation And Contribution Funnel')
  lines.push('')
  lines.push(metricLine('Solved problem events', report.summary.solvedProblemEvents))
  lines.push(metricLine('Draft created events', report.summary.draftCreatedEvents))
  lines.push(metricLine('Confirmation shown events', report.summary.confirmationShownEvents))
  lines.push(metricLine('Public post events', report.summary.publicPostEvents))
  lines.push(metricLine('Contribution completion rate', report.summary.contributionCompletionRate, '%'))
  for (const finding of report.funnelFindings) lines.push(`- ${finding.stage}: ${finding.count ?? 'not measured'} - ${finding.finding}`)
  lines.push('')

  lines.push('## Current Tool Surface')
  lines.push('')
  lines.push('| Tool | Workflow | Role | Score | Calls | Errors | Declared priorityHint |')
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: |')
  for (const tool of report.tools) {
    lines.push(
      `| \`${tool.name}\` | ${tool.workflow} | ${tool.role} | ${tool.discoverabilityScore} | ${tool.callCount} | ${tool.errorCount} | ${tool.priorityHint ?? ''} |`
    )
  }
  lines.push('')

  lines.push('## Tool-Level Findings')
  lines.push('')
  for (const tool of report.tools) {
    if (tool.issues.length === 0 && tool.recommendations.length === 0) continue
    lines.push(`### ${tool.name}`)
    for (const issue of tool.issues) lines.push(`- Issue: ${issue}`)
    for (const recommendation of tool.recommendations) lines.push(`- Recommendation: ${recommendation}`)
    lines.push('')
  }

  lines.push('## Recommended Tool Set')
  lines.push('')
  const contextualNames = new Set(
    report.hiddenTools.filter((hidden) => hidden.preferredAction === 'contextual_exposure').map((hidden) => hidden.tool)
  )
  for (const profile of report.profiles) {
    lines.push(`### ${profile.name}`)
    lines.push(profile.rationale)
    lines.push('')
    for (const tool of profile.tools) {
      const suffix = contextualNames.has(tool) ? ' — contextual (expose only when a pending action exists)' : ''
      lines.push(`- \`${tool}\`${suffix}`)
    }
    lines.push('')
  }

  lines.push('## Rewritten Tool Descriptions')
  lines.push('')
  for (const tool of report.recommendedTools) {
    lines.push(`### ${tool.currentName} -> ${tool.recommendedName}`)
    lines.push(`Profile: ${tool.profile}; advisory priority (non-standard MCP hint, most clients ignore): ${tool.advisoryPriority}`)
    lines.push('')
    lines.push(tool.recommendedDescription)
    lines.push('')
  }

  lines.push('## Merge/Hide/Split Recommendations')
  lines.push('')
  for (const hidden of report.hiddenTools) lines.push(`- Hide or move \`${hidden.tool}\`: ${hidden.reason} Preferred action: ${hidden.preferredAction}.`)
  for (const merge of report.mergedTools) lines.push(`- ${merge.reason} Tools: ${merge.tools.map((tool) => `\`${tool}\``).join(', ')}.`)
  if (report.hiddenTools.length === 0 && report.mergedTools.length === 0) lines.push('- No high-confidence hide or merge recommendations.')
  lines.push('')

  lines.push('## Missed-Prompt Coverage Analysis')
  lines.push('')
  if (report.missedPromptFindings.length === 0) {
    lines.push('- No missed prompts were provided.')
  } else {
    for (const finding of report.missedPromptFindings) {
      lines.push(`- ${finding.finding}`)
      lines.push(`  Prompt: "${finding.prompt}"`)
      lines.push(`  Expected: ${finding.expectedTools.map((tool) => `\`${tool}\``).join(', ') || 'none'}`)
      lines.push(`  Best matches: ${finding.bestMatches.map((match) => `\`${match.tool}\` (${match.score})`).join(', ')}`)
    }
  }
  lines.push('')

  lines.push('## A/B Test Plan')
  lines.push('')
  for (const item of report.abTestPlan) lines.push(`- ${item}`)
  lines.push('')

  lines.push('## Exact Next Instrumentation To Add')
  lines.push('')
  lines.push('- Emit `initialize`, `tools/list`, and `tools/call` with stable `sessionId` values.')
  lines.push('- Emit `solved_problem` when an agent has fixed a generic reusable problem.')
  lines.push('- Emit `draft_created`, `user_confirmation_shown`, `public_post_created`, and `policy_block` for the contribution flow.')
  lines.push('- Track tool-call errors with `tool_error` or `tools/call` events where `ok` is false.')
  lines.push('')

  lines.push('## Privacy/Safety Friction Review')
  lines.push('')
  lines.push('- Keep public posting behind explicit user confirmation and terms acceptance.')
  lines.push('- Make the draft tool safe to call without confirmation because it does not publish.')
  lines.push('- Require the draft step to remove secrets, personal data, company/customer names, private URLs, and incident-specific details.')
  lines.push('- Set the standard MCP ToolAnnotations (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) on each tool so clients can reason about safety.')
  lines.push('- `advisoryPriority` is not a standard MCP annotation and most clients ignore it; the main fix is a smaller default surface with clearer trigger language.')

  return `${lines.join('\n')}\n`
}

function metricLine(label: string, value: number | undefined, suffix = ''): string {
  return `- ${label}: ${value === undefined ? 'not measured' : `${value}${suffix}`}`
}

function formatBytes(value: number): string {
  return value >= 1024 ? `${Math.round(value / 1024)} KB` : `${value} bytes`
}
