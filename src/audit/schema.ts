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
  priorityHint: number
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
    recommendedToolCount: number
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
