import { z } from 'zod'

export const McpToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  inputSchema: z.record(z.string(), z.unknown()).default({ type: 'object', properties: {} }),
  annotations: z.record(z.string(), z.unknown()).optional(),
  _meta: z.record(z.string(), z.unknown()).optional()
})

export const MissedPromptSchema = z.object({
  prompt: z.string().min(1),
  expectedTools: z.array(z.string().min(1)).default([]),
  notes: z.string().default('')
})

export const AuditLogEventSchema = z.object({
  type: z.string().min(1),
  sessionId: z.string().optional(),
  tool: z.string().optional(),
  ok: z.boolean().optional(),
  error: z.string().optional(),
  reason: z.string().optional()
})

export type McpTool = z.infer<typeof McpToolSchema>
export type MissedPrompt = z.infer<typeof MissedPromptSchema>
export type AuditLogEvent = z.infer<typeof AuditLogEventSchema>

export type AuditProfileName = 'production' | 'local-dev' | 'read-only' | 'concise' | 'browser'

export type AuditSeverity = 'info' | 'warn' | 'fail'

export type AuditFindingId =
  | 'missing_description'
  | 'missing_trigger_language'
  | 'description_too_short'
  | 'description_too_long'
  | 'implementation_oriented_description'
  | 'unsafe_write_tool'
  | 'unsafe_destructive_tool'
  | 'tool_overlap'
  | 'catch_all_tool'
  | 'generic_tool_name'
  | 'weak_required_input'
  | 'too_many_required_inputs'
  | 'browser_action_missing_mutation'
  | 'browser_action_missing_preconditions'
  | 'browser_action_missing_artifact'
  | 'score_regression'
  | 'new_low_scoring_tool'
  | 'new_tool_without_description'
  | 'new_destructive_tool_without_safety'

export interface AuditFinding {
  id: AuditFindingId
  severity: AuditSeverity
  message: string
  tool?: string
  scoreImpact?: number
  recommendation?: string
}

export interface AuditPolicy {
  profile: AuditProfileName
  descriptionStyle: 'concise' | 'structured'
  failOn: AuditFindingId[]
  thresholds: {
    minAverageScore: number
    maxScoreDrop: number
    minToolScore: number
  }
  rules: {
    requireDescriptions: boolean
    requireUseWhen: boolean
    requireSafetyForDestructive: boolean
    requireSafetyForWrite: boolean
    flagCatchAllTools: boolean
    flagToolOverlap: AuditSeverity | 'off'
    allowReadOnlyWithoutSafety: boolean
    requireBrowserActionMutation: boolean
    requireBrowserActionPreconditions: boolean
    requireBrowserActionArtifact: boolean
  }
}

export interface ToolAudit {
  name: string
  description: string
  workflow: string
  role: ToolRole
  discoverabilityScore: number
  callCount: number
  errorCount: number
  errorRate: number
  requiredInputCount: number
  priorityHint?: number
  findings: AuditFinding[]
  issues: string[]
  recommendations: string[]
}

export type ToolRole =
  | 'read'
  | 'preview'
  | 'confirm'
  | 'reject'
  | 'feedback'
  | 'analytics'
  | 'admin'
  | 'destructive'
  | 'write'

export interface WorkflowAudit {
  name: string
  toolNames: string[]
  roles: ToolRole[]
  callCount: number
  helperToolCount: number
  completionGateToolCount?: number
  completionRisk?: 'low' | 'may_reduce_completion'
  warning?: string
  recommendation: string
}

export interface ProfileRecommendation {
  name: 'core' | 'admin'
  tools: string[]
  rationale: string
}

export interface RecommendedTool {
  currentName: string
  recommendedName: string
  recommendedDescription: string
  profile: 'core' | 'admin'
  /** Advisory ordering hint only. NOT a standard MCP ToolAnnotations field; most clients ignore it. */
  advisoryPriority: number
}

/**
 * The standard MCP `ToolAnnotations` fields (spec 2025-06-18). These are the real,
 * spec-defined hints a server can set; `priorityHint` is deliberately not here because
 * it is not part of the MCP schema.
 */
export interface McpToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export interface HiddenToolRecommendation {
  tool: string
  reason: string
  preferredAction: 'admin_profile' | 'contextual_exposure' | 'hide'
  followUpKind?: 'surface_clutter_reduction' | 'completion_gate'
  completionImpact?: 'low' | 'may_reduce_completion'
}

export interface MergeRecommendation {
  tools: string[]
  reason: string
}

export interface MissedPromptFinding {
  prompt: string
  expectedTools: string[]
  bestMatches: { tool: string; score: number }[]
  finding: string
}

export interface FunnelFinding {
  stage: string
  count?: number
  finding: string
}

export interface AuditBaselineComparison {
  averageScoreBefore: number
  averageScoreAfter: number
  scoreDelta: number
  newTools: string[]
  removedTools: string[]
  regressedTools: Array<{
    name: string
    before: number
    after: number
    delta: number
  }>
  newFailingFindings: AuditFinding[]
}

export interface AuditCiVerdict {
  status: 'pass' | 'fail'
  info: number
  warn: number
  fail: number
}

export interface ActivationAuditReport {
  summary: {
    toolCount: number
    averageScore: number
    /** Tools shown in the default surface (core profile minus contextual helpers). */
    recommendedToolCount: number
    /** All non-admin tools (default-visible + contextual helpers). */
    coreProfileToolCount?: number
    /** Admin/destructive tools kept out of the default surface. */
    adminProfileToolCount?: number
    /** Confirm/reject helpers exposed only when a pending action exists. */
    contextualToolCount?: number
    /** Contextual helpers that reduce default-surface clutter without expected completion harm. */
    surfaceClutterFollowUpToolCount?: number
    /** Contribution/submission draft, confirmation, or posting gates that should be measured for completion impact. */
    completionGateToolCount?: number
    initializedSessions?: number
    sessionsWithToolCall?: number
    activationRate?: number
    solvedProblemEvents?: number
    draftCreatedEvents?: number
    confirmationShownEvents?: number
    publicPostEvents?: number
    contributionCompletionRate?: number
    manifestBytes?: number
    confirmRejectToolCount?: number
    workflowCount?: number
    topRecommendation: string
  }
  policy: AuditPolicy
  ci: AuditCiVerdict
  baseline?: AuditBaselineComparison
  findings: AuditFinding[]
  tools: ToolAudit[]
  workflows: WorkflowAudit[]
  profiles: ProfileRecommendation[]
  recommendedTools: RecommendedTool[]
  hiddenTools: HiddenToolRecommendation[]
  mergedTools: MergeRecommendation[]
  missedPromptFindings: MissedPromptFinding[]
  funnelFindings: FunnelFinding[]
  abTestPlan: string[]
}

export type CapabilityExposure = 'default' | 'admin' | 'contextual' | 'hidden'

export interface CapabilityTool {
  currentName: string
  name: string
  description: string
  workflow: string
  role: ToolRole
  profile: 'core' | 'admin'
  exposure: CapabilityExposure
  followUpKind?: 'surface_clutter_reduction' | 'completion_gate'
  completionImpact?: 'low' | 'may_reduce_completion'
  /** Standard MCP ToolAnnotations to set on this tool (spec-compliant). */
  annotations: McpToolAnnotations
  /** Advisory ordering hint only; not a standard MCP annotation. Honored by few clients. */
  advisoryPriority: number
  rationale: string
}

export interface CapabilityProfile {
  name: 'core' | 'admin'
  rationale: string
  tools: string[]
}

export interface AuditMcpCapabilities {
  agentifyCapabilitiesVersion: 1
  summary: {
    toolCount: number
    workflowCount?: number
    coreToolCount: number
    adminToolCount: number
    defaultToolCount: number
    contextualToolCount: number
    surfaceClutterFollowUpToolCount?: number
    completionGateToolCount?: number
    manifestBytes?: number
  }
  profiles: CapabilityProfile[]
  tools: CapabilityTool[]
  instrumentationEvents: string[]
  notes: string[]
}
