import {
  ActivationAuditReport,
  AuditMcpCapabilities,
  CapabilityExposure,
  CapabilityTool,
  HiddenToolRecommendation,
  RecommendedTool,
  ToolAudit
} from './schema.js'

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
      manifestBytes: report.summary.manifestBytes
    },
    profiles,
    tools,
    instrumentationEvents: INSTRUMENTATION_EVENTS,
    notes: [
      'This file is a deterministic agentify audit recommendation, not a live MCP protocol response.',
      'Use the core profile as the default tool surface when your MCP client or server can expose profiles.',
      'Expose contextual tools only after a pending action exists, especially confirm/reject helpers.',
      'Priority hints are advisory; clearer names, descriptions, and smaller profiles are the primary fix.'
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
    annotations: {
      priorityHint: recommended?.priorityHint ?? tool.priorityHint ?? defaultPriorityForExposure(exposure)
    },
    rationale: rationaleFor(tool, exposure, hidden)
  }
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
