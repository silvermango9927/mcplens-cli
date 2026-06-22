import { ActivationAuditReport } from './schema.js'

export function renderMarkdownReport(report: ActivationAuditReport): string {
  const lines: string[] = []
  lines.push('# MCP Activation Audit')
  lines.push('')

  lines.push('## Review These Tool Descriptions')
  lines.push('')
  lines.push(
    'Start with the concrete tool descriptions below. The score is secondary metadata; the main goal is to make each tool easy for an agent to choose, skip, or handle safely.'
  )
  lines.push('')
  lines.push(`- Review priority: ${report.summary.topRecommendation}`)
  lines.push(`- Tools needing description review: ${buildReviewItems(report).length} of ${report.summary.toolCount}`)
  lines.push(`- Findings to triage: ${report.ci.fail} fail, ${report.ci.warn} warn, ${report.ci.info} info`)
  lines.push('- Preferred rewrite shape: `Use when` / `Returns` / `Do not use when` / `Safety`.')
  lines.push('')

  lines.push('## Actionable Tool Findings')
  lines.push('')
  const reviewItems = buildReviewItems(report)
  if (reviewItems.length === 0) {
    lines.push('- No high-confidence tool description edits found. Keep reviewing any newly added tools against the recommended format below.')
    lines.push('')
  } else {
    for (const item of reviewItems) {
      const { tool, recommended, hidden } = item
      lines.push(`### ${tool.name}`)
      if (recommended && recommended.recommendedName !== tool.name) lines.push(`- Suggested name: \`${recommended.recommendedName}\``)
      if (hidden) lines.push(`- Exposure: ${hidden.reason} Preferred action: ${hidden.preferredAction}.`)
      for (const finding of tool.findings) lines.push(`- ${finding.severity.toUpperCase()} ${finding.id}: ${finding.message}`)
      for (const recommendation of tool.recommendations) lines.push(`- Recommendation: ${recommendation}`)
      lines.push('- Current description:')
      lines.push('')
      lines.push('```text')
      lines.push(formatDescriptionBlock(tool.description))
      lines.push('```')
      if (recommended) {
        lines.push('')
        lines.push('- Suggested rewrite:')
        lines.push('')
        lines.push('```text')
        lines.push(formatDescriptionBlock(recommended.recommendedDescription))
        lines.push('```')
      }
      lines.push('')
    }
  }

  lines.push('## Recommended Description Format')
  lines.push('')
  lines.push('Use this structure for tool descriptions, especially for write, destructive, public-posting, or workflow-helper tools:')
  lines.push('')
  lines.push('```text')
  lines.push('Use when: the concrete user situation or agent state that should trigger this tool.')
  lines.push('Returns: the result shape or decision the agent can expect.')
  lines.push('Do not use when: nearby tasks where another tool or no tool is a better choice.')
  lines.push('Safety: side effects, confirmation requirements, redaction rules, auth scope, or why the tool is read-only.')
  lines.push('```')
  lines.push('')

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
      const suffix = contextualNames.has(tool) ? ' - contextual (expose only when a pending action exists)' : ''
      lines.push(`- \`${tool}\`${suffix}`)
    }
    lines.push('')
  }

  lines.push('## Secondary Summary And CI Metadata')
  lines.push('')
  lines.push(`- Tools exposed: ${report.summary.toolCount}`)
  lines.push(`- Average discoverability score: ${report.summary.averageScore}`)
  if (report.baseline) lines.push(`- Baseline delta: ${formatSignedNumber(report.baseline.scoreDelta)}`)
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
  lines.push(`- CI status: ${report.ci.status.toUpperCase()}`)
  lines.push(`- CI findings: ${report.ci.fail} fail, ${report.ci.warn} warn, ${report.ci.info} info`)
  lines.push('')
  if (report.ci.fail > 0) {
    lines.push('### Strict CI Failures')
    lines.push('')
    lines.push('| Rule | Tool | Message |')
    lines.push('| --- | --- | --- |')
    for (const finding of report.findings.filter((item) => item.severity === 'fail')) {
      lines.push(`| ${finding.id} | ${finding.tool ? `\`${finding.tool}\`` : ''} | ${finding.message} |`)
    }
    lines.push('')
  }

  if (report.baseline) {
    lines.push('### Baseline Comparison')
    lines.push('')
    lines.push(`- Average score before: ${report.baseline.averageScoreBefore}`)
    lines.push(`- Average score after: ${report.baseline.averageScoreAfter}`)
    lines.push(`- Score delta: ${formatSignedNumber(report.baseline.scoreDelta)}`)
    lines.push(`- New tools: ${formatList(report.baseline.newTools)}`)
    lines.push(`- Removed tools: ${formatList(report.baseline.removedTools)}`)
    if (report.baseline.regressedTools.length > 0) {
      lines.push('')
      lines.push('| Tool | Before | After | Delta |')
      lines.push('| --- | ---: | ---: | ---: |')
      for (const tool of report.baseline.regressedTools) {
        lines.push(`| \`${tool.name}\` | ${tool.before} | ${tool.after} | ${formatSignedNumber(tool.delta)} |`)
      }
    }
    lines.push('')
  }

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
    for (const finding of tool.findings) lines.push(`- ${finding.severity.toUpperCase()} ${finding.id}: ${finding.message}`)
    for (const recommendation of tool.recommendations) lines.push(`- Recommendation: ${recommendation}`)
    lines.push('')
  }

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

type ReviewItem = {
  tool: ActivationAuditReport['tools'][number]
  recommended?: ActivationAuditReport['recommendedTools'][number]
  hidden?: ActivationAuditReport['hiddenTools'][number]
}

function buildReviewItems(report: ActivationAuditReport): ReviewItem[] {
  const recommendedByName = new Map(report.recommendedTools.map((tool) => [tool.currentName, tool]))
  const hiddenByName = new Map(report.hiddenTools.map((tool) => [tool.tool, tool]))
  return report.tools
    .map((tool) => ({
      tool,
      recommended: recommendedByName.get(tool.name),
      hidden: hiddenByName.get(tool.name)
    }))
    .filter((item) => {
      const recommended = item.recommended
      return (
        item.tool.findings.length > 0 ||
        item.tool.issues.length > 0 ||
        item.tool.recommendations.length > 0 ||
        item.hidden !== undefined ||
        (recommended !== undefined &&
          (recommended.recommendedName !== item.tool.name || recommended.recommendedDescription.trim() !== item.tool.description.trim()))
      )
    })
    .sort((a, b) => {
      const severityDelta = severityRank(a.tool) - severityRank(b.tool)
      if (severityDelta !== 0) return severityDelta
      const actionDelta = actionRank(a) - actionRank(b)
      if (actionDelta !== 0) return actionDelta
      return a.tool.discoverabilityScore - b.tool.discoverabilityScore || a.tool.name.localeCompare(b.tool.name)
    })
}

function severityRank(tool: ActivationAuditReport['tools'][number]): number {
  if (tool.findings.some((finding) => finding.severity === 'fail')) return 0
  if (tool.findings.some((finding) => finding.severity === 'warn')) return 1
  if (tool.findings.some((finding) => finding.severity === 'info')) return 2
  return 3
}

function actionRank(item: ReviewItem): number {
  if (item.hidden) return 0
  if (item.recommended && item.recommended.recommendedName !== item.tool.name) return 1
  if (item.tool.recommendations.length > 0) return 2
  return 3
}

function formatDescriptionBlock(value: string): string {
  const trimmed = value.trim()
  return (trimmed.length === 0 ? 'No description supplied.' : trimmed).replace(/```/g, "'''")
}

function formatBytes(value: number): string {
  return value >= 1024 ? `${Math.round(value / 1024)} KB` : `${value} bytes`
}

function formatSignedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

function formatList(values: string[]): string {
  return values.length === 0 ? 'none' : values.map((value) => `\`${value}\``).join(', ')
}
