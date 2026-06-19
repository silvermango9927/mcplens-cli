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

export interface ActivationAuditReport {
  summary: {
    toolCount: number
    /** Tools shown in the default surface (core profile minus contextual helpers). */
    recommendedToolCount: number
    /** All non-admin tools (default-visible + contextual helpers). */
    coreProfileToolCount?: number
    /** Admin/destructive tools kept out of the default surface. */
    adminProfileToolCount?: number
    /** Confirm/reject helpers exposed only when a pending action exists. */
    contextualToolCount?: number
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
    manifestBytes?: number
  }
  profiles: CapabilityProfile[]
  tools: CapabilityTool[]
  instrumentationEvents: string[]
  notes: string[]
}
