import type { ManifestTool, ToolParam } from '../manifest/schema.js'

export function zodInputShapeSource(tool: ManifestTool): string {
  const lines = tool.params.map((param) => `  ${JSON.stringify(param.name)}: ${zodForParam(param)},`)
  const secondary = tool.requests.filter((r) => r.key !== 'main')
  if (secondary.length > 0) {
    const keys = secondary.map((r) => JSON.stringify(r.key)).join(', ')
    lines.push(`  "include": z.array(z.enum([${keys}])).optional().describe("Optional related payloads to fetch"),`)
  }
  return `{\n${lines.join('\n')}\n}`
}

function zodForParam(param: ToolParam): string {
  const base =
    param.type === 'number'
      ? 'z.number()'
      : param.type === 'boolean'
        ? 'z.boolean()'
        : param.type === 'string[]'
          ? 'z.array(z.string())'
          : 'z.string()'
  const described = param.description ? `${base}.describe(${JSON.stringify(param.description)})` : base
  return param.required || param.in === 'path' ? described : `${described}.optional()`
}
