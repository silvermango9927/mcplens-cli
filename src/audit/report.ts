import { ActivationAuditReport } from './schema.js'
import { CONTRIBUTION_GATE_WARNING } from './workflow-risk.js'

export function renderMarkdownReport(report: ActivationAuditReport): string {
  const lines: string[] = []
  lines.push('# MCP Activation Audit')
  lines.push('')
  lines.push(
    'Purpose: prevent tool-surface drift. As an MCP server grows, overlapping tools, wordier descriptions, and unclear follow-up flows make agents less likely to call the right tool.'
  )
  lines.push('')

  lines.push('## Prevent Tool-Surface Drift')
  lines.push('')
  lines.push(
    'Start by deciding the activation model, then rewrite the concrete tool descriptions below. The score is secondary metadata; the main goal is to make each tool easy for an agent to choose, skip, or handle safely.'
  )
  lines.push('')
  for (const item of driftDiagnosis(report)) lines.push(`- ${item}`)
  lines.push(`- Review priority: ${report.summary.topRecommendation}`)
  lines.push(`- Tools needing description review: ${buildReviewItems(report).length} of ${report.summary.toolCount}`)
  lines.push(`- Findings to triage: ${report.ci.fail} fail, ${report.ci.warn} warn, ${report.ci.info} info`)
  lines.push('- Preferred rewrite shape: short, decisive `Use when` / `Returns` / `Do not use when` / `Safety`.')
  lines.push('')

  lines.push('## Implementation Plan For Cursor/Claude')
  lines.push('')
  lines.push('Feed this section to a coding agent as the concrete fix plan:')
  lines.push('')
  for (const item of implementationPlan(report)) lines.push(`- [ ] ${item}`)
  lines.push('')

  if (report.policy.profile === 'browser') {
    lines.push('## Browser MCP Profile')
    lines.push('')
    lines.push('For browser action tools, state the operational contract before an agent calls the tool:')
    lines.push('')
    lines.push('- `Mutates:` the browser state changed by the action, such as active tab URL, focus, form fields, scroll position, file picker selection, or page DOM state.')
    lines.push('- `Preconditions:` required session, tab/page, selector, loaded URL, user gesture, or page-readiness state.')
    lines.push('- `Available afterward:` trace/debug artifacts such as session id, replay URL, screenshot, DOM observation, console trace, or network trace.')
    lines.push('')
  }

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
  if (report.policy.profile === 'browser') {
    lines.push('For browser action tools, use this browser-specific structure:')
    lines.push('')
    lines.push('```text')
    lines.push('Use when: the concrete browser interaction the agent should perform.')
    lines.push('Mutates: the exact browser state changed by the action.')
    lines.push('Preconditions: session/tab/page/selector/readiness requirements before calling.')
    lines.push('Available afterward: session id, replay URL, screenshot, DOM observation, console trace, network trace, or another debug artifact.')
    lines.push('```')
    lines.push('')
  }

  lines.push('## Rewritten Tool Descriptions')
  lines.push('')
  lines.push('Keep these rewrites short and activation-oriented. Avoid implementation detail unless it helps the agent choose the correct tool.')
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
  if (hasContributionCompletionGate(report)) lines.push(`- Warning: ${CONTRIBUTION_GATE_WARNING}`)
  lines.push('')

  lines.push('## Recommended Tool Set')
  lines.push('')
  lines.push('Use this activation model to keep primary tools from competing with after-action helpers:')
  lines.push('')
  const contextualNames = new Set(
    report.hiddenTools.filter((hidden) => hidden.preferredAction === 'contextual_exposure').map((hidden) => hidden.tool)
  )
  const completionGateNames = new Set(
    report.hiddenTools.filter((hidden) => hidden.followUpKind === 'completion_gate').map((hidden) => hidden.tool)
  )
  for (const profile of report.profiles) {
    lines.push(`### ${profile.name}`)
    lines.push(profile.rationale)
    lines.push('')
    for (const tool of profile.tools) {
      const suffix = completionGateNames.has(tool)
        ? ' - contextual gate (may affect completion; measure continuation)'
        : contextualNames.has(tool)
          ? ' - contextual follow-up (reduces default-surface clutter)'
          : ''
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
  if (report.summary.surfaceClutterFollowUpToolCount !== undefined) {
    lines.push(`- Low-risk follow-up helpers: ${report.summary.surfaceClutterFollowUpToolCount}`)
  }
  if (report.summary.completionGateToolCount !== undefined) {
    lines.push(`- Contribution/submission gates to measure: ${report.summary.completionGateToolCount}`)
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
  lines.push('- Recommended CI posture: advisory PR comment or warn-only check by default; strict failure only for teams that explicitly want blocking policy.')
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

  lines.push('## Proof To Collect Before Monetization')
  lines.push('')
  lines.push('- Tool usage: compare sessions with any tool call before and after the surface change.')
  lines.push('- Correct-tool selection: replay missed prompts and track whether the expected tool becomes the top match.')
  lines.push('- Failed attempts: compare `tools/call` errors and prompt retries after descriptions are shortened.')
  lines.push('- Token/time savings: compare `tools/list` payload size, first-tool-call latency, and total turns to task completion.')
  lines.push('- Change confidence: use PR baseline diffs to show which new or edited tools would have caused surface drift.')
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

  lines.push('## Activation And Contribution Funnel')
  lines.push('')
  lines.push(metricLine('Solved problem events', report.summary.solvedProblemEvents))
  lines.push(metricLine('Draft created events', report.summary.draftCreatedEvents))
  lines.push(metricLine('Confirmation shown events', report.summary.confirmationShownEvents))
  lines.push(metricLine('Public post events', report.summary.publicPostEvents))
  lines.push(metricLine('Contribution completion rate', report.summary.contributionCompletionRate, '%'))
  if (hasContributionCompletionGate(report)) lines.push(`- Warning: ${CONTRIBUTION_GATE_WARNING}`)
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

function driftDiagnosis(report: ActivationAuditReport): string[] {
  const overlapCount = report.findings.filter((finding) => finding.id === 'tool_overlap').length
  const helperCount = report.summary.confirmRejectToolCount ?? 0
  const workflowCount = report.summary.workflowCount ?? report.workflows.length
  const contextualCount = report.summary.contextualToolCount ?? 0
  const adminCount = report.summary.adminProfileToolCount ?? 0
  const lowRiskFollowUpCount = report.summary.surfaceClutterFollowUpToolCount ?? 0
  const completionGateCount = report.summary.completionGateToolCount ?? 0
  const items = [
    `Surface shape: ${report.summary.toolCount} exposed tools collapse into ${workflowCount} workflow group${workflowCount === 1 ? '' : 's'}.`,
    `Primary surface: ${report.summary.recommendedToolCount} default-visible tools; ${contextualCount} follow-up/helper tools; ${adminCount} admin/destructive tools.`,
    `Overlap diagnosis: ${overlapCount === 0 ? 'no high-confidence overlapping pairs found' : `${overlapCount} overlapping tool findings need merge, rename, or sharper boundaries`}.`,
    `Flow diagnosis: ${helperCount} confirm/reject helper tool${helperCount === 1 ? '' : 's'} should be exposed after a pending action exists, not as primary choices.`,
    `Follow-up distinction: ${lowRiskFollowUpCount} low-risk helper tool${lowRiskFollowUpCount === 1 ? '' : 's'} reduce default-surface clutter; ${completionGateCount} contribution/submission gate tool${completionGateCount === 1 ? '' : 's'} may reduce workflow completion.`
  ]
  if (report.summary.activationRate !== undefined) {
    items.push(`Observed activation: ${report.summary.activationRate}% of initialized sessions made a tool call.`)
  } else {
    items.push('Observed activation: not measured yet; add initialize and tools/call logs to prove whether the drift fix increases usage.')
  }
  return items
}

function implementationPlan(report: ActivationAuditReport): string[] {
  const defaultTools = defaultVisibleToolNames(report)
  const contextualTools = report.hiddenTools
    .filter((tool) => tool.preferredAction === 'contextual_exposure' && tool.followUpKind !== 'completion_gate')
    .map((tool) => tool.tool)
  const completionGateTools = report.hiddenTools.filter((tool) => tool.followUpKind === 'completion_gate').map((tool) => tool.tool)
  const adminTools = report.hiddenTools.filter((tool) => tool.preferredAction === 'admin_profile').map((tool) => tool.tool)
  const plan = [
    'Export the current MCP tools/list and keep this report plus the JSON audit as the baseline for future PR checks.',
    `Define the activation model: default-visible primary tools are ${formatList(defaultTools)}; low-risk contextual follow-up tools are ${formatList(contextualTools)}; contribution/submission gates are ${formatList(completionGateTools)}; admin/destructive tools are ${formatList(adminTools)}.`,
    'Update server registration so contextual follow-up tools are only advertised after a pending action exists, or move them behind a separate admin/profile configuration if the client cannot do contextual exposure.',
    hasContributionCompletionGate(report)
      ? `For contribution/submission workflows, keep necessary draft/confirmation/posting safety gates but track completion before adding more. ${CONTRIBUTION_GATE_WARNING}`
      : 'For contribution/submission workflows, add draft/confirmation/posting completion metrics before introducing new safety gates.',
    'For every item in Actionable Tool Findings, apply the suggested name/description or an equivalent shorter rewrite with a decisive trigger, return shape, exclusion rule, and safety note.',
    'Resolve each Merge/Hide/Split recommendation by merging overlapping capabilities, renaming tools that compete for the same prompt, or making the boundary explicit in `Do not use when` wording.',
    'Add or update standard MCP ToolAnnotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) so safety is machine-readable instead of buried in prose.',
    'Wire warn-only CI on pull requests with a baseline audit so new tools, overlap, score regressions, and missing descriptions get an advisory PR comment before drift ships.',
    'Instrument proof metrics: initialized sessions, tools/list payload bytes, tools/call success/error, missed-prompt replay results, first-tool-call latency, and task completion turns.'
  ]
  if (report.policy.profile === 'browser') {
    plan.splice(
      5,
      0,
      'For browser action tools, add explicit `Mutates`, `Preconditions`, and `Available afterward` lines so agents know what state changes, what must already be true, and what trace/debug artifact they can inspect after the call.'
    )
  }
  return plan
}

function defaultVisibleToolNames(report: ActivationAuditReport): string[] {
  const hiddenNames = new Set(report.hiddenTools.map((tool) => tool.tool))
  return report.profiles.find((profile) => profile.name === 'core')?.tools.filter((tool) => !hiddenNames.has(tool)) ?? []
}

function hasContributionCompletionGate(report: ActivationAuditReport): boolean {
  return (report.summary.completionGateToolCount ?? 0) > 0 || report.workflows.some((workflow) => workflow.completionRisk === 'may_reduce_completion')
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
