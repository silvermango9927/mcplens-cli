import { PartialAnalysisSchema, type PartialAnalysis, type ResponseMapEntry, type ToolParam } from '../manifest/schema.js'
import { endpointKey } from '../spec/condense.js'
import type { LoadedEndpoint, LoadedSpec } from '../spec/loader.js'
import type { Sample } from '../sampler/sampler.js'
import { buildSystemPrompt, buildUserPrompt } from './prompt.js'
import { AnthropicLlmClient, type LlmClient } from './client.js'

export interface AnalyzeOptions {
  offline?: boolean
  client?: LlmClient
}

export async function analyzeApi(spec: LoadedSpec, samples: Sample[], options: AnalyzeOptions = {}): Promise<PartialAnalysis> {
  if (!options.offline && (options.client || process.env.ANTHROPIC_API_KEY)) {
    const client = options.client ?? new AnthropicLlmClient()
    return analyzeWithLlm(client, spec, samples)
  }
  return heuristicAnalyze(spec, samples)
}

async function analyzeWithLlm(client: LlmClient, spec: LoadedSpec, samples: Sample[]): Promise<PartialAnalysis> {
  const system = buildSystemPrompt()
  const user = buildUserPrompt(spec, samples)
  let lastError = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await client.complete(system, attempt === 1 ? user : `${user}\n\nPrevious JSON validation error: ${lastError}`)
    try {
      return PartialAnalysisSchema.parse(extractJson(response))
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }
  throw new Error(`Anthropic analysis did not produce a valid manifest after 3 attempts: ${lastError}`)
}

export function heuristicAnalyze(spec: LoadedSpec, samples: Sample[]): PartialAnalysis {
  const byEndpoint = new Map(samples.map((s) => [s.endpoint, s]))
  const visible = chooseVisibleEndpoints(spec.endpoints)
  const tools = visible.map((endpoint) => {
    const sample = byEndpoint.get(endpointKey(endpoint))
    const responseMap = sample ? responseMapFromSample(sample.response) : defaultResponseMap()
    return {
      name: toolName(endpoint),
      description: endpoint.summary ?? `${endpoint.method} ${endpoint.path}`,
      params: endpoint.params,
      requests: [{ key: 'main', method: endpoint.method, path: endpoint.path }],
      responseMap
    }
  })
  const visibleKeys = new Set(visible.map(endpointKey))
  const hiddenEndpoints = spec.endpoints
    .filter((e) => !visibleKeys.has(endpointKey(e)))
    .map((e) => ({ endpoint: endpointKey(e), reason: hiddenReason(e) }))
  return PartialAnalysisSchema.parse({ tools, hiddenEndpoints })
}

function chooseVisibleEndpoints(endpoints: LoadedEndpoint[]): LoadedEndpoint[] {
  const scored = endpoints
    .filter((e) => !e.deprecated && !isObviouslyHidden(e))
    .map((endpoint) => ({ endpoint, score: endpointScore(endpoint) }))
    .filter((x) => x.score > -5)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, 20).map((x) => x.endpoint)
}

function isObviouslyHidden(endpoint: LoadedEndpoint): boolean {
  const text = `${endpoint.operationId ?? ''} ${endpoint.summary ?? ''} ${endpoint.path} ${endpoint.tags.join(' ')}`.toLowerCase()
  return /(avatar|icon|attachment|upload|download|webhook|admin|oauth|permission|audit)/.test(text)
}

function endpointScore(endpoint: LoadedEndpoint): number {
  const text = `${endpoint.operationId ?? ''} ${endpoint.summary ?? ''} ${endpoint.path} ${endpoint.tags.join(' ')}`.toLowerCase()
  let score = endpoint.method === 'GET' ? 8 : endpoint.method === 'POST' ? 2 : 0
  for (const good of ['get', 'list', 'search', 'issue', 'ticket', 'task', 'user', 'project', 'pull', 'repository', 'status']) {
    if (text.includes(good)) score += 3
  }
  for (const bad of ['avatar', 'icon', 'webhook', 'admin', 'audit', 'attachment', 'upload', 'download', 'oauth', 'permission', 'bulk']) {
    if (text.includes(bad)) score -= 8
  }
  return score
}

function hiddenReason(endpoint: LoadedEndpoint): string {
  const text = `${endpoint.path} ${endpoint.summary ?? ''}`.toLowerCase()
  if (/(avatar|icon|attachment|upload|download)/.test(text)) return 'UI asset or binary payload; usually not agent-relevant'
  if (/(webhook|admin|oauth|permission|audit)/.test(text)) return 'Operational/admin endpoint outside the V1 agent-useful toolset'
  return 'Not selected for the curated V1 toolset'
}

function toolName(endpoint: LoadedEndpoint): string {
  const source = endpoint.operationId ?? `${endpoint.method}_${endpoint.path}`
  const cleaned = source
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/\{([^}]+)\}/g, '$1')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return /^[a-z]/.test(cleaned) ? cleaned : `tool_${cleaned || 'call'}`
}

function responseMapFromSample(response: unknown): ResponseMapEntry[] {
  const leaves = collectLeaves(response)
  const selected = leaves
    .map((path) => ({ path, score: fieldScore(path) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 16)
  const entries = selected.map(({ path }) => ({
    from: path,
    to: leanName(path),
    source: 'main',
    transform: transformFor(path),
    reason: 'Agent-relevant identifier, state, label, timestamp, URL, or concise content'
  }))
  return dedupeResponseEntries(entries.length ? entries : defaultResponseMap())
}

function collectLeaves(value: unknown, prefix = ''): string[] {
  if (value == null || typeof value !== 'object') return prefix ? [prefix] : []
  if (Array.isArray(value)) {
    if (value.length === 0) return prefix ? [prefix] : []
    return collectLeaves(value[0], `${prefix}[]`)
  }
  const out: string[] = []
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out.push(...collectLeaves(child, prefix ? `${prefix}.${key}` : key))
  }
  return out
}

function fieldScore(path: string): number {
  const lower = path.toLowerCase()
  let score = 0
  for (const good of ['id', 'key', 'number', 'name', 'title', 'summary', 'status', 'state', 'description', 'body', 'url', 'html_url', 'created', 'updated', 'assignee', 'author', 'owner', 'login']) {
    if (lower.split(/[.[\]]+/).includes(good) || lower.endsWith(good)) score += 5
  }
  for (const bad of ['avatar', 'icon', 'color', 'style', 'self', 'links', '_links', 'rendered', 'html', 'metadata', 'schema']) {
    if (lower.includes(bad)) score -= 5
  }
  if (lower.length > 90) score -= 2
  return score
}

function leanName(path: string): string {
  const parts = path.replace(/\[\]/g, '').split('.')
  const last = parts.at(-1) ?? path
  const prev = parts.at(-2)
  if (prev === 'status' && last === 'name') return 'status'
  const raw = ['id', 'name', 'login'].includes(last) && prev ? `${prev}_${last}` : last
  return raw.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function transformFor(path: string): ResponseMapEntry['transform'] {
  const lower = path.toLowerCase()
  if (lower.includes('html')) return 'stripHtml'
  if (lower.includes('description') || lower.includes('body')) return 'firstLine'
  return undefined
}

function defaultResponseMap(): ResponseMapEntry[] {
  return [{ from: 'id', to: 'id', source: 'main', reason: 'Stable identifier if present' }]
}

function dedupeResponseEntries(entries: ResponseMapEntry[]): ResponseMapEntry[] {
  const seen = new Set<string>()
  const out: ResponseMapEntry[] = []
  for (const entry of entries) {
    const key = entry.to
    if (seen.has(key)) continue
    seen.add(key)
    out.push(entry)
  }
  return out
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) return JSON.parse(trimmed)
  const match = trimmed.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object found in LLM response')
  return JSON.parse(match[0])
}
