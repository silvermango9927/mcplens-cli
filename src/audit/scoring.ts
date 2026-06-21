import {
  AuditLogEvent,
  AuditFinding,
  AuditFindingId,
  AuditPolicy,
  AuditSeverity,
  FunnelFinding,
  McpTool,
  MissedPrompt,
  MissedPromptFinding,
  ToolAudit,
  ToolRole,
  WorkflowAudit
} from './schema.js'
import { resolveAuditPolicy, severityForFinding } from './config.js'

export interface UsageSummary {
  callCounts: Map<string, number>
  errorCounts: Map<string, number>
  initializedSessions?: number
  sessionsWithToolCall?: number
  activationRate?: number
  solvedProblemEvents?: number
  draftCreatedEvents?: number
  confirmationShownEvents?: number
  publicPostEvents?: number
  contributionCompletionRate?: number
  funnelFindings: FunnelFinding[]
}

export function auditTools(tools: McpTool[], logs: AuditLogEvent[], missedPrompts: MissedPrompt[], policy = resolveAuditPolicy({})): ToolAudit[] {
  const usage = summarizeUsage(logs)
  const promptExpected = new Set(missedPrompts.flatMap((prompt) => prompt.expectedTools))
  const audits = tools.map((tool) => scoreTool(tool, usage, promptExpected, policy))
  applyOverlapFindings(tools, audits, policy)
  return audits.sort((a, b) => a.name.localeCompare(b.name))
}

export function summarizeUsage(logs: AuditLogEvent[]): UsageSummary {
  const callCounts = new Map<string, number>()
  const errorCounts = new Map<string, number>()
  const initialized = new Set<string>()
  const withToolCall = new Set<string>()
  let anonymousInitialized = 0
  let anonymousWithToolCall = 0
  let solved = 0
  let draft = 0
  let confirmation = 0
  let publicPost = 0
  let policyBlock = 0

  for (const event of logs) {
    if (event.type === 'initialize') {
      if (event.sessionId) initialized.add(event.sessionId)
      else anonymousInitialized += 1
    }
    if (event.type === 'tools/call' && event.tool) {
      callCounts.set(event.tool, (callCounts.get(event.tool) ?? 0) + 1)
      if (event.sessionId) withToolCall.add(event.sessionId)
      else anonymousWithToolCall += 1
      if (event.ok === false) errorCounts.set(event.tool, (errorCounts.get(event.tool) ?? 0) + 1)
    }
    if (event.type === 'tool_error' && event.tool && (event.error || event.ok === false)) {
      errorCounts.set(event.tool, (errorCounts.get(event.tool) ?? 0) + 1)
    }
    if (event.type === 'solved_problem' || event.type === 'problem_solved' || event.type === 'generic_problem_solved') solved += 1
    if (event.type === 'draft_created') draft += 1
    if (event.type === 'user_confirmation_shown') confirmation += 1
    if (event.type === 'public_post_created') publicPost += 1
    if (event.type === 'policy_block') policyBlock += 1
  }

  const initializedSessions = initialized.size + anonymousInitialized || undefined
  const sessionsWithToolCall = withToolCall.size + anonymousWithToolCall || undefined
  const activationRate =
    initializedSessions && sessionsWithToolCall !== undefined ? roundPercent(sessionsWithToolCall / initializedSessions) : undefined
  const contributionCompletionRate = solved > 0 ? roundPercent(publicPost / solved) : draft > 0 ? roundPercent(publicPost / draft) : undefined

  const funnelFindings: FunnelFinding[] = []
  if (solved === 0) {
    funnelFindings.push({
      stage: 'generic_problem_solved',
      finding: 'Logs do not include solved-problem events, so the contribution funnel cannot be measured from the true eligibility point.'
    })
  } else {
    funnelFindings.push({ stage: 'generic_problem_solved', count: solved, finding: 'Eligible solved-problem events were observed.' })
  }
  if (draft === 0) {
    funnelFindings.push({
      stage: 'draft_created',
      finding: 'No draft-created events were observed. Add instrumentation or make the safe draft tool more visible.'
    })
  } else if (solved > 0 && draft < solved) {
    funnelFindings.push({ stage: 'draft_created', count: draft, finding: 'Draft creation is lower than eligible solved problems.' })
  }
  if (confirmation === 0) {
    funnelFindings.push({
      stage: 'user_confirmation_shown',
      finding: 'No user-confirmation events were observed. Track when a draft is shown for explicit public-post confirmation.'
    })
  } else if (draft > 0 && confirmation < draft) {
    funnelFindings.push({ stage: 'user_confirmation_shown', count: confirmation, finding: 'Some drafts do not reach user confirmation.' })
  }
  if (publicPost === 0) {
    funnelFindings.push({ stage: 'public_post_created', finding: 'No public-post events were observed.' })
  } else if (confirmation > 0 && publicPost < confirmation) {
    funnelFindings.push({ stage: 'public_post_created', count: publicPost, finding: 'Confirmed drafts are not always published.' })
  }
  if (policyBlock > 0) {
    funnelFindings.push({ stage: 'policy_block', count: policyBlock, finding: 'Policy blocks are present; review whether the draft step gives agents a safe redaction path.' })
  }

  return {
    callCounts,
    errorCounts,
    initializedSessions,
    sessionsWithToolCall,
    activationRate,
    solvedProblemEvents: solved || undefined,
    draftCreatedEvents: draft || undefined,
    confirmationShownEvents: confirmation || undefined,
    publicPostEvents: publicPost || undefined,
    contributionCompletionRate,
    funnelFindings
  }
}

export function buildWorkflowAudits(toolAudits: ToolAudit[]): WorkflowAudit[] {
  const grouped = new Map<string, ToolAudit[]>()
  for (const audit of toolAudits) {
    const group = grouped.get(audit.workflow) ?? []
    group.push(audit)
    grouped.set(audit.workflow, group)
  }
  return [...grouped.entries()]
    .map(([name, audits]) => {
      const roles = unique(audits.map((audit) => audit.role))
      const helperToolCount = audits.filter((audit) => audit.role === 'confirm' || audit.role === 'reject').length
      return {
        name,
        toolNames: audits.map((audit) => audit.name).sort(),
        roles,
        callCount: audits.reduce((sum, audit) => sum + audit.callCount, 0),
        helperToolCount,
        recommendation: workflowRecommendation(name, audits, helperToolCount)
      }
    })
    .sort((a, b) => b.toolNames.length - a.toolNames.length || a.name.localeCompare(b.name))
}

export function analyzeMissedPrompts(tools: McpTool[], prompts: MissedPrompt[]): MissedPromptFinding[] {
  return prompts.map((prompt) => {
    const promptTokens = tokenize(prompt.prompt)
    const matches = tools
      .map((tool) => ({ tool: tool.name, score: overlapScore(promptTokens, toolTokens(tool)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
    const expected = prompt.expectedTools.map((name) => tools.find((tool) => tool.name === name)).filter((tool): tool is McpTool => Boolean(tool))
    const expectedBest = expected.length > 0 ? Math.max(...expected.map((tool) => overlapScore(promptTokens, toolTokens(tool)))) : 0
    const top = matches[0]?.score ?? 0
    const second = matches[1]?.score ?? 0
    let finding = 'Expected tool trigger is reasonably represented in the current surface.'
    if (expected.length < prompt.expectedTools.length) finding = 'One or more expected tools are missing from tools/list or renamed without a matching alias.'
    else if (expectedBest < 0.12) finding = 'Expected tool description does not advertise this prompt as a trigger.'
    else if (top > 0 && Math.abs(top - second) < 0.05) finding = 'Multiple tools match this prompt similarly; the surface is ambiguous.'
    return { prompt: prompt.prompt, expectedTools: prompt.expectedTools, bestMatches: matches, finding }
  })
}

export function classifyRole(name: string, annotations?: Record<string, unknown>): ToolRole {
  if (annotations?.destructiveHint === true) return 'destructive'
  if (annotations?.readOnlyHint === true) return 'read'

  const tokens = tokenizeName(name)
  const first = tokens[0] ?? ''
  if (first === 'confirm') return 'confirm'
  if (first === 'reject') return 'reject'
  if (tokens.some((t) => ['delete', 'remove', 'unlink', 'destroy', 'drop', 'purge', 'truncate'].includes(t))) return 'destructive'
  if (tokens.some((t) => ['compress', 'compression', 'admin', 'maintenance', 'candidate', 'relation', 'relations'].includes(t))) return 'admin'
  if (['search', 'get', 'list', 'read', 'find'].includes(first)) return 'read'
  if (['report', 'vote', 'mark'].includes(first) || tokens.some((t) => ['useful', 'usage', 'feedback'].includes(t))) return 'feedback'
  if (['record', 'track'].includes(first)) return 'analytics'
  if (['submit', 'suggest', 'request', 'draft', 'preview'].includes(first)) return 'preview'
  if (['create', 'post', 'publish', 'add', 'resolve', 'update'].includes(first)) return 'write'
  return 'write'
}

export function workflowName(toolName: string): string {
  const tokens = tokenizeName(toolName)
  if (tokens.some((t) => ['compress', 'compression', 'candidate', 'candidates'].includes(t))) return 'compression'
  if (tokens.some((t) => ['relation', 'relations', 'link', 'unlink'].includes(t))) return 'relations'
  if (tokens.includes('delete') && tokens.includes('learning')) return 'delete_learning'
  if (tokens.includes('delete') && tokens.includes('addendum')) return 'delete_addendum'
  if (tokens.includes('addendum') || tokens.includes('addendums')) return 'addendums'
  if (tokens.includes('usage')) return 'agent_usage'
  if (tokens[0] === 'search') return tokens.includes('issue') || tokens.includes('issues') ? 'open_issue_search' : 'search'
  if (tokens.includes('issue') || tokens.includes('issues')) {
    if (tokens.includes('resolve')) return 'resolve_open_issue'
    return 'open_issue'
  }
  if (tokens.includes('learning') || tokens.includes('learnings') || tokens.includes('solution') || tokens.includes('solutions')) {
    if (tokens.some((t) => ['report', 'vote', 'useful'].includes(t))) return 'learning_feedback'
    return 'learning_contribution'
  }
  if (tokens.includes('edit')) return 'edit'
  return dropWorkflowRolePrefix(tokens).join('_') || toolName
}

function scoreTool(tool: McpTool, usage: UsageSummary, promptExpected: Set<string>, policy: AuditPolicy): ToolAudit {
  const role = classifyRole(tool.name, tool.annotations)
  const findings: AuditFinding[] = []
  const recommendations: string[] = []
  let score = 100
  const description = tool.description.trim()
  const nameTokens = tokenizeName(tool.name)
  const props = inputProperties(tool)
  const required = requiredInputs(tool)
  const callCount = usage.callCounts.get(tool.name) ?? 0
  const errorCount = usage.errorCounts.get(tool.name) ?? 0
  const errorRate = callCount > 0 ? roundPercent(errorCount / callCount) : 0
  const addFinding = (
    id: AuditFindingId,
    message: string,
    scoreImpact: number,
    fallbackSeverity: AuditSeverity = 'warn',
    recommendation?: string
  ): void => {
    findings.push({
      id,
      severity: severityForFinding(policy, id, fallbackSeverity),
      message,
      tool: tool.name,
      scoreImpact,
      recommendation
    })
    score += scoreImpact
  }

  if (nameTokens.length <= 1 && nameTokens.some((token) => GENERIC_NAMES.has(token))) {
    addFinding('generic_tool_name', 'Tool name is generic and does not name the job or domain object.', -18)
  }
  if (GENERIC_NAMES.has(nameTokens[0] ?? '')) {
    score -= 8
    recommendations.push('Prefer a verb plus concrete domain object in the name.')
  }
  if (policy.rules.flagCatchAllTools && isCatchAllTool(tool, nameTokens)) {
    addFinding(
      'catch_all_tool',
      'Catch-all execution tool needs a narrow threat model, clear scope, and guardrail wording.',
      -16,
      'warn',
      'Document exactly when agents should use this broad execution surface and what it must not touch.'
    )
  }
  if (description.length === 0 && policy.rules.requireDescriptions) {
    addFinding('missing_description', 'Tool is missing a top-level MCP description.', -24, 'warn', 'Add a concise user-intent description.')
  }
  if (description.length > 0 && policy.rules.requireUseWhen && !/(^|\b)(use when|when to use|call this|call it when)\b/i.test(description)) {
    addFinding(
      'missing_trigger_language',
      'Description lacks explicit "Use when" trigger language.',
      -14,
      'warn',
      'Add a short trigger phrase when this policy requires structured descriptions.'
    )
  }
  if (description.length > 0 && description.length < 20) {
    addFinding('description_too_short', 'Description is too short for reliable model selection.', -16)
  }
  const maxDescriptionLength = policy.descriptionStyle === 'concise' ? 240 : 300
  if (description.length > maxDescriptionLength) {
    addFinding('description_too_long', 'Description is long enough to create tool-list noise.', -8, 'info')
  }
  if (/(api endpoint|database|crud|submit an item|execute|invoke)/i.test(description)) {
    addFinding(
      'implementation_oriented_description',
      'Description is implementation-oriented instead of user-intent-oriented.',
      -8,
      'info'
    )
  }
  if (required.length > 4) {
    addFinding('too_many_required_inputs', 'Tool has many required inputs.', -Math.min(20, (required.length - 4) * 4), 'warn')
  }
  const weakRequired = required.filter((name) => weakPropertyDescription(props.get(name)))
  if (weakRequired.length > 0) {
    addFinding(
      'weak_required_input',
      `Required inputs need clearer descriptions or examples: ${weakRequired.join(', ')}.`,
      -Math.min(18, weakRequired.length * 5),
      'warn'
    )
  }
  if (role === 'destructive' && policy.rules.requireSafetyForDestructive && !hasSafetyWording(description)) {
    addFinding(
      'unsafe_destructive_tool',
      'Destructive tool lacks explicit confirmation, safety, or review wording.',
      -18,
      'warn',
      'State the required confirmation or safety path before data is deleted, removed, or purged.'
    )
  } else if ((role === 'write' || role === 'preview') && policy.rules.requireSafetyForWrite && !hasSafetyWording(description)) {
    addFinding(
      'unsafe_write_tool',
      'Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.',
      -14,
      'warn',
      'Clarify whether this writes immediately or creates a draft/reviewable change.'
    )
  }
  if (errorRate >= 25) {
    score -= 15
    recommendations.push(`Observed error rate is high (${errorRate}%).`)
  }
  if (callCount === 0 && promptExpected.has(tool.name)) {
    score -= 15
    recommendations.push('Tool has zero observed calls despite being expected in missed prompts.')
  }
  if ((nameTokens.includes('post') || nameTokens.includes('publish') || nameTokens.includes('submit')) && !/(draft|confirm|review|does not publish)/i.test(description)) {
    score -= 12
    recommendations.push('Contribution/public-posting tool sounds like immediate publication instead of a safe draft-confirm flow.')
  }
  if (role === 'confirm' || role === 'reject') {
    recommendations.push('Keep for safety, but consider contextual exposure only when there is a pending action.')
  }
  if (role === 'admin' || role === 'destructive') {
    recommendations.push('Move to an admin profile unless ordinary users need this in the default surface.')
  }

  return {
    name: tool.name,
    description,
    workflow: workflowName(tool.name),
    role,
    discoverabilityScore: Math.max(0, Math.min(100, Math.round(score))),
    callCount,
    errorCount,
    errorRate,
    requiredInputCount: required.length,
    priorityHint: priorityHint(tool),
    findings,
    issues: findings.map((finding) => finding.message),
    recommendations
  }
}

function applyOverlapFindings(tools: McpTool[], audits: ToolAudit[], policy: AuditPolicy): void {
  if (policy.rules.flagToolOverlap === 'off') return
  const byName = new Map(audits.map((audit) => [audit.name, audit]))
  for (let i = 0; i < tools.length; i += 1) {
    for (let j = i + 1; j < tools.length; j += 1) {
      const score = overlapScore(toolTokens(tools[i]), toolTokens(tools[j]))
      if (score < 0.55) continue
      const left = byName.get(tools[i].name)
      const right = byName.get(tools[j].name)
      if (left) addOverlapFinding(left, tools[j].name, policy)
      if (right) addOverlapFinding(right, tools[i].name, policy)
    }
  }
}

function addOverlapFinding(audit: ToolAudit, otherTool: string, policy: AuditPolicy): void {
  const finding: AuditFinding = {
    id: 'tool_overlap',
    severity: severityForFinding(policy, 'tool_overlap', 'warn'),
    message: `Overlaps heavily with ${otherTool}.`,
    tool: audit.name,
    scoreImpact: -8,
    recommendation: 'Rename, merge, or clarify the tools so model selection has a single obvious target.'
  }
  audit.findings.push(finding)
  audit.issues.push(finding.message)
  audit.discoverabilityScore = Math.max(0, audit.discoverabilityScore - 8)
}

function workflowRecommendation(name: string, audits: ToolAudit[], helperToolCount: number): string {
  if (helperToolCount > 0) {
    return `${name} includes ${helperToolCount} confirm/reject helper tool${helperToolCount === 1 ? '' : 's'}; keep the safety flow but hide helpers until pending actions exist or move them to a lower-priority profile.`
  }
  if (audits.some((audit) => audit.role === 'admin' || audit.role === 'destructive')) {
    return `${name} looks like admin or maintenance surface; consider moving it out of the default tools/list.`
  }
  if (audits.some((audit) => audit.role === 'read')) return `${name} is read-oriented and should stay in the core profile if it supports common user prompts.`
  return `${name} should use sharper trigger language so agents know when to call it.`
}

function inputProperties(tool: McpTool): Map<string, Record<string, unknown>> {
  const properties = asRecord(tool.inputSchema.properties)
  return new Map(Object.entries(properties).map(([name, value]) => [name, asRecord(value)]))
}

function requiredInputs(tool: McpTool): string[] {
  const required = tool.inputSchema.required
  return Array.isArray(required) ? required.filter((value): value is string => typeof value === 'string') : []
}

function weakPropertyDescription(property: Record<string, unknown> | undefined): boolean {
  if (!property) return true
  const description = typeof property.description === 'string' ? property.description : ''
  const hasExample = property.example !== undefined || property.examples !== undefined
  return description.length < 12 && !hasExample
}

function priorityHint(tool: McpTool): number | undefined {
  const value = tool.annotations?.priorityHint ?? tool._meta?.priorityHint ?? tool.annotations?.['priority_hint'] ?? tool._meta?.['priority_hint']
  return typeof value === 'number' ? value : undefined
}

function hasSafetyWording(description: string): boolean {
  return /(confirm|review|draft|safe|redact|does not publish|explicit|undo|irreversible|destructive|permission)/i.test(description)
}

function isCatchAllTool(tool: McpTool, nameTokens: string[]): boolean {
  const haystack = `${tool.name} ${tool.description}`.toLowerCase()
  if (nameTokens.includes('eval') || nameTokens.includes('shell')) return true
  if (nameTokens.includes('execute') && (nameTokens.includes('js') || nameTokens.includes('javascript') || nameTokens.includes('code'))) return true
  if (nameTokens.includes('run') && (nameTokens.includes('code') || nameTokens.includes('command') || nameTokens.includes('script'))) return true
  return /\b(execute arbitrary|run arbitrary|shell command|javascript|eval|python code|sql query)\b/.test(haystack)
}

function dropWorkflowRolePrefix(tokens: string[]): string[] {
  const prefixes = new Set(['submit', 'confirm', 'reject', 'request', 'suggest', 'get', 'create', 'add', 'record', 'report'])
  return prefixes.has(tokens[0] ?? '') ? tokens.slice(1) : tokens
}

function toolTokens(tool: McpTool): Set<string> {
  return tokenize(`${tool.name} ${tool.description} ${[...inputProperties(tool).keys()].join(' ')}`)
}

function tokenizeName(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(singularize)
}

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2).map(singularize))
}

function singularize(token: string): string {
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.endsWith('ss')) return token
  if (token.endsWith('s') && token.length > 4) return token.slice(0, -1)
  return token
}

function overlapScore(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  const intersection = [...left].filter((token) => right.has(token)).length
  return Number((intersection / Math.min(left.size, right.size)).toFixed(2))
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

function roundPercent(value: number): number {
  return Math.round(value * 1000) / 10
}

const GENERIC_NAMES = new Set(['query', 'search', 'submit', 'call', 'run', 'tool', 'api', 'create', 'post', 'publish'])
