import type { Manifest, ManifestTool } from '../manifest/schema.js'
import { zodInputShapeSource } from './zod-src.js'

export function toolFileSource(_manifest: Manifest, tool: ManifestTool): string {
  const fnName = `register${toPascal(tool.name)}`
  const inputShape = zodInputShapeSource(tool)
  const requests = JSON.stringify(tool.requests, null, 2)
  const params = JSON.stringify(tool.params, null, 2)
  const responseMap = JSON.stringify(tool.responseMap, null, 2)
  return `import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MapEntry } from '../lib/mapping.js'
import { z } from 'zod'
import { applyResponseMap } from '../lib/mapping.js'
import { requestJson } from '../lib/upstream.js'

const REQUESTS = ${requests} as const
const PARAMS = ${params} as const
const RESPONSE_MAP: MapEntry[] = ${responseMap}

export function ${fnName}(server: McpServer): void {
  server.registerTool(
    ${JSON.stringify(tool.name)},
    {
      description: ${JSON.stringify(tool.description)},
      inputSchema: ${inputShape},
      annotations: { readOnlyHint: ${tool.requests.every((r) => r.method === 'GET')} }
    },
    async (args) => {
      const payloads: Record<string, unknown> = {}
      const main = REQUESTS.find((request) => request.key === 'main')
      if (!main) throw new Error('Tool ${tool.name} has no main request')
      payloads.main = await requestJson(main.method, main.path, args, PARAMS)

      for (const request of REQUESTS) {
        if (request.key === 'main') continue
        const include = Array.isArray((args as Record<string, unknown>).include) ? (args as Record<string, unknown>).include as string[] : []
        if (!include.includes(request.key)) continue
        payloads[request.key] = await requestJson(request.method, request.path, args, [])
      }

      const result = applyResponseMap(payloads, RESPONSE_MAP)
      return {
        structuredContent: result,
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
      }
    }
  )
}
`
}

export function registerFunctionName(toolName: string): string {
  return `register${toPascal(toolName)}`
}

function toPascal(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('')
}
