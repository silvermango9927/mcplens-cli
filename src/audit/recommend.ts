import {
  ActivationAuditReport,
  AuditLogEvent,
  AuditPolicy,
  HiddenToolRecommendation,
  McpTool,
  MergeRecommendation,
  MissedPrompt,
  ProfileRecommendation,
  RecommendedTool,
  ToolAudit
} from './schema.js'
import { compareAuditBaseline } from './baseline.js'
import { resolveAuditPolicy } from './config.js'
import { analyzeMissedPrompts, auditTools, buildWorkflowAudits, isBrowserActionTool, summarizeUsage } from './scoring.js'
import { CONTRIBUTION_GATE_WARNING, isContributionSubmissionGate } from './workflow-risk.js'

export interface BuildAuditReportOptions {
  tools: McpTool[]
  logs: AuditLogEvent[]
  missedPrompts: MissedPrompt[]
  manifestBytes?: number
  policy?: AuditPolicy
  baselineReport?: unknown
}

export function buildAuditReport(options: BuildAuditReportOptions): ActivationAuditReport {
  const policy = options.policy ?? resolveAuditPolicy({})
  const usage = summarizeUsage(options.logs)
  const tools = auditTools(options.tools, options.logs, options.missedPrompts, policy)
  const workflows = buildWorkflowAudits(tools)
  const hiddenTools = buildHiddenTools(tools)
  const recommendedTools = buildRecommendedTools(tools)
  const profiles = buildProfiles(tools)
  const mergedTools = buildMergeRecommendations(tools)
  const missedPromptFindings = analyzeMissedPrompts(options.tools, options.missedPrompts)
  const confirmRejectToolCount = tools.filter((tool) => tool.role === 'confirm' || tool.role === 'reject').length
  const completionGateToolCount = tools.filter(isContributionSubmissionGate).length
  const baseline = options.baselineReport ? compareAuditBaseline(tools, options.baselineReport, policy) : undefined
  const findings = [...tools.flatMap((tool) => tool.findings), ...(baseline?.newFailingFindings ?? [])]
  const ci = buildCiVerdict(findings)
  const averageScore = averageDiscoverabilityScore(tools)

  // Reconcile the two views of "core" so the markdown report and the capabilities
  // plan agree: the core profile is every non-admin tool, but only the ones that are
  // not pushed to contextual exposure are shown in the default surface.
  const hiddenNames = new Set(hiddenTools.map((hidden) => hidden.tool))
  const coreProfileTools = profiles.find((profile) => profile.name === 'core')?.tools ?? recommendedTools.map((tool) => tool.currentName)
  const adminProfileToolCount = profiles.find((profile) => profile.name === 'admin')?.tools.length ?? 0
  const defaultVisibleTools = coreProfileTools.filter((name) => !hiddenNames.has(name))
  const contextualToolCount = coreProfileTools.length - defaultVisibleTools.length
  const surfaceClutterFollowUpToolCount = hiddenTools.filter((tool) => tool.followUpKind === 'surface_clutter_reduction').length
  const recommendedToolCount = defaultVisibleTools.length

  return {
    summary: {
      toolCount: tools.length,
      averageScore,
      recommendedToolCount,
      coreProfileToolCount: coreProfileTools.length,
      adminProfileToolCount,
      contextualToolCount,
      surfaceClutterFollowUpToolCount,
      completionGateToolCount,
      initializedSessions: usage.initializedSessions,
      sessionsWithToolCall: usage.sessionsWithToolCall,
      activationRate: usage.activationRate,
      solvedProblemEvents: usage.solvedProblemEvents,
      draftCreatedEvents: usage.draftCreatedEvents,
      confirmationShownEvents: usage.confirmationShownEvents,
      publicPostEvents: usage.publicPostEvents,
      contributionCompletionRate: usage.contributionCompletionRate,
      manifestBytes: options.manifestBytes,
      confirmRejectToolCount,
      workflowCount: workflows.length,
      topRecommendation: topRecommendation(tools, workflows, options.manifestBytes)
    },
    policy,
    ci,
    baseline,
    findings,
    tools,
    workflows,
    profiles,
    recommendedTools,
    hiddenTools,
    mergedTools,
    missedPromptFindings,
    funnelFindings: usage.funnelFindings,
    abTestPlan: [
      'Expose a core profile with only search, feedback, low-friction usage tracking, and safe draft/start contribution tools.',
      'Rewrite contribution descriptions to separate draft creation from confirmed public publishing.',
      'Move admin/destructive and confirm/reject helper tools to an admin or contextual surface, then compare first-tool-call and draft-created rates.',
      'Add setup instructions telling agents to search existing shared solutions before answering from memory.',
      'Track initialized sessions -> useful tool-call sessions -> draft created -> confirmation shown -> public post created.'
    ]
  }
}

function buildCiVerdict(findings: { severity: 'info' | 'warn' | 'fail' }[]): ActivationAuditReport['ci'] {
  const info = findings.filter((finding) => finding.severity === 'info').length
  const warn = findings.filter((finding) => finding.severity === 'warn').length
  const fail = findings.filter((finding) => finding.severity === 'fail').length
  return {
    status: fail > 0 ? 'fail' : 'pass',
    info,
    warn,
    fail
  }
}

function averageDiscoverabilityScore(tools: ToolAudit[]): number {
  if (tools.length === 0) return 0
  return Math.round((tools.reduce((sum, tool) => sum + tool.discoverabilityScore, 0) / tools.length) * 10) / 10
}

function buildProfiles(tools: ToolAudit[]): ProfileRecommendation[] {
  // A tool's profile is decided solely by role so that this list, the per-tool
  // recommendations, and the capabilities plan never disagree. Confirm/reject helpers
  // stay in the core profile (they belong to ordinary user flows) but are surfaced
  // contextually rather than in the default tools/list.
  const coreTools = tools.filter((tool) => !isAdminRole(tool.role)).map((tool) => tool.name)
  const adminTools = tools.filter((tool) => isAdminRole(tool.role)).map((tool) => tool.name)
  return [
    {
      name: 'core',
      tools: coreTools,
      rationale:
        'Default surface for ordinary agent sessions. Read/feedback/contribution tools stay visible; confirm/reject helpers belong here too but should be exposed contextually, not in the default tools/list.'
    },
    {
      name: 'admin',
      tools: adminTools,
      rationale: 'Maintenance and destructive capabilities should not compete with high-value default workflows.'
    }
  ]
}

function isAdminRole(role: ToolAudit['role']): boolean {
  return role === 'admin' || role === 'destructive'
}

function buildHiddenTools(tools: ToolAudit[]): HiddenToolRecommendation[] {
  return tools
    .filter((tool) => tool.role === 'admin' || tool.role === 'destructive' || ((tool.role === 'confirm' || tool.role === 'reject') && tool.callCount === 0))
    .map((tool): HiddenToolRecommendation => {
      if (tool.role === 'confirm' || tool.role === 'reject') {
        const completionGate = isContributionSubmissionGate(tool)
        return {
          tool: tool.name,
          reason: completionGate
            ? `Contribution/submission confirmation or posting gate should not compete in the default surface, but it can affect completion if agents do not continue the workflow. ${CONTRIBUTION_GATE_WARNING}`
            : 'Follow-up helper tools are useful after a pending action exists and reduce default-surface clutter without changing the primary completion path.',
          preferredAction: 'contextual_exposure',
          followUpKind: completionGate ? 'completion_gate' : 'surface_clutter_reduction',
          completionImpact: completionGate ? 'may_reduce_completion' : 'low'
        }
      }
      return {
        tool: tool.name,
        reason: 'Admin, maintenance, or destructive capability should not be exposed to every ordinary agent session by default.',
        preferredAction: 'admin_profile'
      }
    })
}

function buildRecommendedTools(tools: ToolAudit[]): RecommendedTool[] {
  return tools.map((tool) => ({
    currentName: tool.name,
    recommendedName: recommendedName(tool),
    recommendedDescription: recommendedDescription(tool),
    profile: isAdminRole(tool.role) ? 'admin' : 'core',
    advisoryPriority: recommendedPriority(tool)
  }))
}

function buildMergeRecommendations(tools: ToolAudit[]): MergeRecommendation[] {
  const byWorkflow = new Map<string, ToolAudit[]>()
  for (const tool of tools) {
    const group = byWorkflow.get(tool.workflow) ?? []
    group.push(tool)
    byWorkflow.set(tool.workflow, group)
  }
  const recommendations: MergeRecommendation[] = []
  for (const [workflow, group] of byWorkflow) {
    const helpers = group.filter((tool) => tool.role === 'confirm' || tool.role === 'reject')
    if (helpers.length >= 2) {
      const hasCompletionGate = group.some(isContributionSubmissionGate)
      recommendations.push({
        tools: group.map((tool) => tool.name).sort(),
        reason: hasCompletionGate
          ? `${workflow} is split into draft/confirm/reject gates. Preserve safety, but treat this as a completion-risk funnel and measure whether agents reach the posting step.`
          : `${workflow} is split into preview/confirm/reject helpers. Preserve safety, but expose helpers contextually or behind a lower-priority profile.`
      })
    }
  }
  return recommendations
}

function recommendedName(tool: ToolAudit): string {
  const name = tool.name
  if (/^search_.*(learning|solution)/.test(name)) return 'search_reusable_solutions'
  if (/(submit|post|create).*?(learning|solution)/.test(name)) return 'draft_public_solution'
  if (/confirm.*?(learning|solution)/.test(name)) return 'publish_confirmed_solution'
  if (/reject.*?(learning|solution)/.test(name)) return 'reject_public_solution_draft'
  return name
}

function recommendedDescription(tool: ToolAudit): string {
  const name = recommendedName(tool)
  if (name === 'search_reusable_solutions') {
    return 'Use when: the user is blocked by a setup, runtime, package, configuration, or integration problem and you need to search previously shared fixes before answering from memory.\nReturns: concise matching solutions and context.\nDo not use when: the user needs unrelated browsing, private incident lookup, or a source-of-truth query outside this solution store.\nSafety: read-only lookup; do not include secrets, private URLs, or incident-specific data in the search query.'
  }
  if (name === 'draft_public_solution') {
    return 'Use when: you have just helped the user solve a generic, reusable technical problem such as a package bug, setup failure, configuration issue, or integration workaround.\nReturns: a redacted public-safe draft for user review; this tool does not publish anything.\nDo not use when: the solution is customer-specific, incident-specific, private, speculative, or not useful to other developers.\nSafety: remove secrets, personal data, company/customer names, private URLs, and incident-specific details before drafting.'
  }
  if (name === 'publish_confirmed_solution') {
    return 'Use when: the user has reviewed a generated public-safe draft and explicitly confirmed they want to publish it publicly under the service terms.\nReturns: the public solution record.\nDo not use when: no draft exists, the user has not explicitly confirmed publication, or the content still contains private details.\nSafety: publishes publicly; only call after the draft step and explicit user confirmation.'
  }
  if (tool.role === 'confirm') {
    const safety =
      isContributionSubmissionGate(tool)
        ? 'confirmation/posting gate; expose contextually after a pending draft exists and measure contribution completion.'
        : 'confirmation helper; expose contextually only after there is a pending action.'
    return `Use when: a pending ${tool.workflow} action has already been shown to the user and the user explicitly confirmed it.\nReturns: the confirmed result.\nDo not use when: starting a new workflow, guessing user intent, or bypassing a preview/draft step.\nSafety: ${safety}`
  }
  if (tool.role === 'reject') {
    const safety =
      isContributionSubmissionGate(tool)
        ? 'rejection gate for a contribution/submission draft; expose contextually and measure draft-to-public-post completion.'
        : 'rejection helper; expose contextually only after there is a pending action.'
    return `Use when: a pending ${tool.workflow} action has been shown and the user rejects it or asks to discard it.\nReturns: the canceled pending action.\nDo not use when: starting a new workflow or silently canceling an action without user intent.\nSafety: ${safety}`
  }
  if (tool.role === 'admin' || tool.role === 'destructive') {
    return `Use when: an administrator intentionally needs ${tool.workflow} maintenance.\nReturns: the maintenance result.\nDo not use when: serving ordinary user workflows or when a read-only inspection tool would be enough.\nSafety: admin/destructive capability; keep out of the default user-facing profile and require explicit operator intent.`
  }
  if (isBrowserActionTool(tool)) {
    return hasBrowserDescriptionSections(tool.description)
      ? tool.description
      : `Use when: the agent must perform the ${tool.workflow.replace(/_/g, ' ')} browser action in an existing browser session.\nMutates: state whether this changes the active session, page URL/history, DOM/application state, form values, cookies/auth, focus/scroll/viewport, or explicitly does not mutate page state.\nPreconditions: state the required active session, loaded page, prior observe call, known target element/selector, authenticated state, user gesture, or page-readiness state before calling.\nAvailable afterward: state the trace output, such as session id, final URL, replay URL, screenshot, action result, observation result, extracted structured payload, console logs, or network logs.`
  }
  return hasRecommendedDescriptionSections(tool.description)
    ? tool.description
    : `Use when: the user needs the ${tool.workflow.replace(/_/g, ' ')} workflow.\nReturns: the relevant result.\nDo not use when: the task belongs to another workflow or no tool call is needed.\nSafety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.`
}

function hasRecommendedDescriptionSections(description: string): boolean {
  return ['Use when:', 'Returns:', 'Do not use when:', 'Safety:'].every((section) => description.includes(section))
}

function hasBrowserDescriptionSections(description: string): boolean {
  return ['Use when:', 'Mutates:', 'Preconditions:', 'Available afterward:'].every((section) => description.includes(section))
}

function recommendedPriority(tool: ToolAudit): number {
  if (tool.role === 'read') return 1
  if (tool.role === 'feedback' || tool.role === 'analytics' || tool.role === 'preview' || tool.role === 'write') return 0.7
  if (tool.role === 'confirm' || tool.role === 'reject') return 0.2
  return 0.1
}

function topRecommendation(tools: ToolAudit[], workflows: { toolNames: string[] }[], manifestBytes?: number): string {
  const helperCount = tools.filter((tool) => tool.role === 'confirm' || tool.role === 'reject').length
  if (helperCount > tools.length * 0.25) {
    return `${tools.length} exposed tools collapse into ${workflows.length} workflows; reduce default tool-list noise by moving confirm/reject helpers to contextual exposure or a lower-priority profile.`
  }
  if (manifestBytes && manifestBytes > 40_000) {
    return `The tools/list payload is ${formatBytes(manifestBytes)} before useful work starts; ship a smaller core profile and keep admin tools separate.`
  }
  const lowScore = [...tools].sort((a, b) => a.discoverabilityScore - b.discoverabilityScore)[0]
  return lowScore
    ? `Rewrite ${lowScore.name} with concrete "Use when" trigger language and a clearer safe path.`
    : 'Keep the default MCP surface small and instrument the contribution funnel.'
}

function formatBytes(value: number): string {
  return value >= 1024 ? `${Math.round(value / 1024)} KB` : `${value} bytes`
}
