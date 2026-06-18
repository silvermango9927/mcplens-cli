import { readFile } from 'node:fs/promises'
import { AuditLogEventSchema, McpTool, McpToolSchema, MissedPrompt, MissedPromptSchema } from './schema.js'

export interface LoadedToolsList {
  tools: McpTool[]
  manifestBytes: number
}

export async function loadToolsList(filePath: string): Promise<LoadedToolsList> {
  const text = await readFile(filePath, 'utf8')
  const raw = JSON.parse(text) as unknown
  return { tools: normalizeToolsList(raw), manifestBytes: Buffer.byteLength(text, 'utf8') }
}

export async function loadAuditLogs(filePath: string): Promise<ReturnType<typeof AuditLogEventSchema.parse>[]> {
  const rows = await loadJsonOrJsonl(filePath)
  return rows.map(normalizeLogEvent).filter((event): event is ReturnType<typeof AuditLogEventSchema.parse> => event !== null)
}

export async function loadMissedPrompts(filePath: string): Promise<MissedPrompt[]> {
  const rows = await loadJsonOrJsonl(filePath)
  return rows.map((row) => MissedPromptSchema.parse(row))
}

export function normalizeToolsList(raw: unknown): McpTool[] {
  const tools = extractTools(raw)
  return tools.map((tool) => {
    const record = asRecord(tool)
    const inputSchema = asRecord(record.inputSchema ?? record.input_schema ?? record.schema ?? { type: 'object', properties: {} })
    return McpToolSchema.parse({
      name: String(record.name ?? ''),
      description: typeof record.description === 'string' ? record.description : '',
      inputSchema,
      annotations: maybeRecord(record.annotations),
      _meta: maybeRecord(record._meta ?? record.meta)
    })
  })
}

function extractTools(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  const record = asRecord(raw)
  if (Array.isArray(record.tools)) return record.tools
  const result = asRecord(record.result)
  if (Array.isArray(result.tools)) return result.tools
  throw new Error('tools-list must be a bare array, {"tools":[...]}, or MCP {"result":{"tools":[...]}} response')
}

async function loadJsonOrJsonl(filePath: string): Promise<unknown[]> {
  const text = await readFile(filePath, 'utf8')
  const trimmed = text.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed) as unknown
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown)
  }
}

function normalizeLogEvent(raw: unknown): ReturnType<typeof AuditLogEventSchema.parse> | null {
  const record = asRecord(raw)
  const params = asRecord(record.params)
  const rawType = String(record.type ?? record.method ?? record.event ?? '').trim()
  if (!rawType) return null

  const type = normalizeEventType(rawType)
  const tool = firstString(record.tool, record.name, record.toolName, params.name, params.tool, params.toolName)
  const error = stringifyError(record.error ?? params.error)
  return AuditLogEventSchema.parse({
    type,
    sessionId: firstString(record.sessionId, record.session_id, params.sessionId, params.session_id),
    tool,
    ok: normalizeOk(record, params, error),
    error,
    reason: firstString(record.reason, params.reason)
  })
}

function normalizeEventType(value: string): string {
  const lowered = value.toLowerCase()
  if (
    [
      'tool_error',
      'solved_problem',
      'problem_solved',
      'generic_problem_solved',
      'draft_created',
      'user_confirmation_shown',
      'public_post_created',
      'policy_block'
    ].includes(lowered)
  ) {
    return lowered
  }
  const type = lowered.replace(/_/g, '/')
  if (type === 'tool/call') return 'tools/call'
  if (type === 'tools/list') return 'tools/list'
  if (type === 'initialize' || type === 'initialized') return 'initialize'
  if (type === 'tool/error') return 'tool_error'
  return type
}

function normalizeOk(record: Record<string, unknown>, params: Record<string, unknown>, error?: string): boolean | undefined {
  if (typeof record.ok === 'boolean') return record.ok
  if (typeof params.ok === 'boolean') return params.ok
  if (typeof record.isError === 'boolean') return !record.isError
  if (typeof params.isError === 'boolean') return !params.isError
  if (error) return false
  return undefined
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) if (typeof value === 'string' && value.length > 0) return value
  return undefined
}

function stringifyError(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  const record = maybeRecord(value)
  if (record && typeof record.message === 'string') return record.message
  return undefined
}

function maybeRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  return maybeRecord(value) ?? {}
}
