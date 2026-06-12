import type { LoadedEndpoint, LoadedSpec } from './loader.js'

export interface CondensedEndpoint {
  endpoint: string
  operationId?: string
  summary?: string
  tags: string[]
  params: { name: string; in: string; type: string; required: boolean }[]
}

export function endpointKey(endpoint: Pick<LoadedEndpoint, 'method' | 'path'>): string {
  return `${endpoint.method} ${endpoint.path}`
}

export function condenseSpec(spec: LoadedSpec, maxChars = 120_000): string {
  const endpoints = spec.endpoints.map(condenseEndpoint)
  const chunks: string[] = [
    `API: ${spec.title}`,
    `Base URL: ${spec.baseUrl}`,
    `Auth: ${spec.auth.type}`,
    'Endpoints:',
    JSON.stringify(endpoints, null, 2)
  ]
  const text = chunks.join('\n')
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n[truncated]`
}

export function condenseEndpoint(endpoint: LoadedEndpoint): CondensedEndpoint {
  return {
    endpoint: endpointKey(endpoint),
    operationId: endpoint.operationId,
    summary: endpoint.summary ?? endpoint.description?.slice(0, 240),
    tags: endpoint.tags,
    params: endpoint.params.map((p) => ({
      name: p.name,
      in: p.in,
      type: p.type,
      required: p.required
    }))
  }
}
