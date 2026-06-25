import {
  ActivationAuditReport,
  AuditMcpCapabilities,
  CapabilityExposure,
  CapabilityTool,
  HiddenToolRecommendation,
  McpToolAnnotations,
  RecommendedTool,
  ToolAudit,
  ToolRole
} from './schema.js'
import { isContributionSubmissionGate } from './workflow-risk.js'

const INSTRUMENTATION_EVENTS = [
  'initialize',
  'tools/list',
  'tools/call',
  'tool_error',
  'solved_problem',
  'draft_created',
  'user_confirmation_shown',
  'public_post_created',
  'policy_block'
]

export function buildAuditCapabilities(report: ActivationAuditReport): AuditMcpCapabilities {
  const recommendedByName = new Map(report.recommendedTools.map((tool) => [tool.currentName, tool]))
  const hiddenByName = new Map(report.hiddenTools.map((tool) => [tool.tool, tool]))
  const tools = report.tools.map((tool) => capabilityTool(tool, recommendedByName.get(tool.name), hiddenByName.get(tool.name)))
  const profiles = report.profiles.map((profile) => ({
    name: profile.name,
    rationale: profile.rationale,
    tools: tools
      .filter((tool) => tool.profile === profile.name && tool.exposure !== 'hidden')
      .map((tool) => tool.name)
      .sort()
  }))

  return {
    agentifyCapabilitiesVersion: 1,
    summary: {
      toolCount: report.summary.toolCount,
      workflowCount: report.summary.workflowCount,
      coreToolCount: tools.filter((tool) => tool.profile === 'core').length,
      adminToolCount: tools.filter((tool) => tool.profile === 'admin').length,
      defaultToolCount: tools.filter((tool) => tool.exposure === 'default').length,
      contextualToolCount: tools.filter((tool) => tool.exposure === 'contextual').length,
      surfaceClutterFollowUpToolCount: tools.filter((tool) => tool.followUpKind === 'surface_clutter_reduction').length,
      completionGateToolCount: tools.filter((tool) => tool.completionImpact === 'may_reduce_completion').length,
      manifestBytes: report.summary.manifestBytes
    },
    profiles,
    tools,
    instrumentationEvents: INSTRUMENTATION_EVENTS,
    notes: [
      'This file is a deterministic mcplens audit recommendation, not a live MCP protocol response.',
      'The core profile is every non-admin tool; expose low-risk contextual follow-up helpers only after a pending action exists, and treat contribution/submission gates as completion-risk steps to measure.',
      'Each tool\'s `annotations` are standard MCP ToolAnnotations (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) — set these on your real tools so clients can reason about safety.',
      '`advisoryPriority` is NOT a standard MCP annotation and most clients ignore it. The reliable levers are a smaller default surface, clearer trigger language, and the standard annotations above.'
    ]
  }
}

function capabilityTool(tool: ToolAudit, recommended: RecommendedTool | undefined, hidden: HiddenToolRecommendation | undefined): CapabilityTool {
  const profile = recommended?.profile ?? (tool.role === 'admin' || tool.role === 'destructive' ? 'admin' : 'core')
  const exposure = exposureFor(profile, hidden)
  return {
    currentName: tool.name,
    name: recommended?.recommendedName ?? tool.name,
    description: recommended?.recommendedDescription ?? tool.description,
    workflow: tool.workflow,
    role: tool.role,
    profile,
    exposure,
    followUpKind: hidden?.followUpKind,
    completionImpact: hidden?.completionImpact ?? (isContributionSubmissionGate(tool) ? 'may_reduce_completion' : undefined),
    annotations: standardAnnotations(tool.role),
    advisoryPriority: recommended?.advisoryPriority ?? tool.priorityHint ?? defaultPriorityForExposure(exposure),
    rationale: rationaleFor(tool, exposure, hidden)
  }
}

/**
 * Derive the standard MCP `ToolAnnotations` (spec 2025-06-18) from the inferred role.
 * Only emits hints we can defend from the role: read-only and idempotent for reads,
 * destructive for delete-like tools, and additive (non-destructive write) otherwise.
 */
function standardAnnotations(role: ToolRole): McpToolAnnotations {
  if (role === 'read') return { readOnlyHint: true, idempotentHint: true }
  if (role === 'destructive') return { readOnlyHint: false, destructiveHint: true }
  return { readOnlyHint: false, destructiveHint: false }
}

function exposureFor(profile: 'core' | 'admin', hidden: HiddenToolRecommendation | undefined): CapabilityExposure {
  if (hidden?.preferredAction === 'hide') return 'hidden'
  if (hidden?.preferredAction === 'contextual_exposure') return 'contextual'
  if (profile === 'admin' || hidden?.preferredAction === 'admin_profile') return 'admin'
  return 'default'
}

function defaultPriorityForExposure(exposure: CapabilityExposure): number {
  if (exposure === 'default') return 0.7
  if (exposure === 'contextual') return 0.2
  return 0.1
}

function rationaleFor(tool: ToolAudit, exposure: CapabilityExposure, hidden: HiddenToolRecommendation | undefined): string {
  if (hidden) return hidden.reason
  if (exposure === 'admin') return 'Keep out of the default surface because this is an admin or destructive capability.'
  if (exposure === 'contextual') return 'Expose only when the user or server has created a pending action for this workflow.'
  if (tool.issues.length > 0) return tool.issues[0]
  return 'Keep in the default surface with sharper trigger language for model selection.'
}
