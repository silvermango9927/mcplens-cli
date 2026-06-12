import SwaggerParser from '@apidevtools/swagger-parser'
import path from 'node:path'
import type { ManifestAuth, ToolParam } from '../manifest/schema.js'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface LoadedEndpoint {
  method: HttpMethod
  path: string
  operationId?: string
  summary?: string
  description?: string
  deprecated?: boolean
  tags: string[]
  params: ToolParam[]
}

export interface LoadedSpec {
  sourcePath: string
  title: string
  version: string
  baseUrl: string
  auth: ManifestAuth
  endpoints: LoadedEndpoint[]
}

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete'])

export async function loadOpenApiSpec(specPath: string, baseUrlOverride?: string): Promise<LoadedSpec> {
  const absolute = path.resolve(specPath)
  const doc = (await SwaggerParser.dereference(absolute)) as Record<string, any>
  const info = doc.info ?? {}
  const title = String(info.title ?? 'Agentified API')
  const version = String(info.version ?? '0.1.0')
  const baseUrl = normalizeBaseUrl(baseUrlOverride ?? inferBaseUrl(doc))
  const auth = inferAuth(doc, title)
  const endpoints = collectEndpoints(doc)
  if (endpoints.length === 0) throw new Error('OpenAPI spec has no supported REST operations')
  return { sourcePath: absolute, title, version, baseUrl, auth, endpoints }
}

function inferBaseUrl(doc: Record<string, any>): string {
  const servers = Array.isArray(doc.servers) ? doc.servers : []
  const url = servers.find((s) => typeof s?.url === 'string')?.url
  if (url?.startsWith('http://') || url?.startsWith('https://')) return url
  return 'https://api.example.com'
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function inferAuth(doc: Record<string, any>, title: string): ManifestAuth {
  const schemes = doc.components?.securitySchemes ?? {}
  const prefix = envPrefix(title)
  for (const [name, scheme] of Object.entries<any>(schemes)) {
    if (scheme?.type === 'http' && String(scheme.scheme).toLowerCase() === 'bearer') {
      return { type: 'bearer', envVar: `${prefix}_API_TOKEN` }
    }
    if (scheme?.type === 'http' && String(scheme.scheme).toLowerCase() === 'basic') {
      return { type: 'basic', userEnvVar: `${prefix}_API_USER`, passEnvVar: `${prefix}_API_TOKEN` }
    }
    if (scheme?.type === 'apiKey' && scheme.in === 'header') {
      return { type: 'header', header: String(scheme.name ?? name), envVar: `${prefix}_API_KEY` }
    }
  }
  return { type: 'none' }
}

function envPrefix(title: string): string {
  const normalized = title.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized || 'UPSTREAM'
}

function collectEndpoints(doc: Record<string, any>): LoadedEndpoint[] {
  const paths = doc.paths ?? {}
  const endpoints: LoadedEndpoint[] = []
  for (const [route, pathItem] of Object.entries<any>(paths)) {
    const pathParams = readParams(pathItem?.parameters)
    for (const [methodRaw, operation] of Object.entries<any>(pathItem ?? {})) {
      if (!METHODS.has(methodRaw)) continue
      const method = methodRaw.toUpperCase() as HttpMethod
      const opParams = [...pathParams, ...readParams(operation?.parameters)]
      endpoints.push({
        method,
        path: route,
        operationId: operation?.operationId,
        summary: operation?.summary,
        description: operation?.description,
        deprecated: Boolean(operation?.deprecated),
        tags: Array.isArray(operation?.tags) ? operation.tags.map(String) : [],
        params: dedupeParams([...pathTemplateParams(route), ...opParams])
      })
    }
  }
  return endpoints.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`))
}

function readParams(params: unknown): ToolParam[] {
  if (!Array.isArray(params)) return []
  return params
    .filter((p) => p && ['path', 'query'].includes(String((p as any).in)))
    .map((p: any) => ({
      name: String(p.name),
      in: p.in === 'path' ? 'path' : 'query',
      type: schemaType(p.schema),
      required: p.in === 'path' ? true : Boolean(p.required),
      description: String(p.description ?? '')
    }))
}

function pathTemplateParams(route: string): ToolParam[] {
  return [...route.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: 'path' as const,
    type: 'string' as const,
    required: true,
    description: `Path parameter ${match[1]}`
  }))
}

function dedupeParams(params: ToolParam[]): ToolParam[] {
  const seen = new Set<string>()
  const out: ToolParam[] = []
  for (const p of params) {
    const key = `${p.in}:${p.name}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

function schemaType(schema: any): ToolParam['type'] {
  if (schema?.type === 'array' && schema.items?.type === 'string') return 'string[]'
  if (schema?.type === 'number' || schema?.type === 'integer') return 'number'
  if (schema?.type === 'boolean') return 'boolean'
  return 'string'
}
