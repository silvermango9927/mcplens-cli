// Lean-response mapping runtime. Dependency-free and self-contained on purpose:
// agentify copies this file verbatim into every generated MCP server (src/lib/mapping.ts).

export type TransformName = 'stripHtml' | 'adfToPlainText' | 'toString' | 'count' | 'firstLine'

export interface MapEntry {
  from: string
  to: string
  source?: string
  transform?: TransformName
  reason?: string
}

export function getPath(value: unknown, path: string): unknown {
  if (!path) return value
  const [head, ...rest] = path.split('.')
  const restPath = rest.join('.')
  if (head.endsWith('[]')) {
    const arr = (value as Record<string, unknown> | null | undefined)?.[head.slice(0, -2)]
    if (!Array.isArray(arr)) return undefined
    return arr.map((item) => getPath(item, restPath))
  }
  const next = (value as Record<string, unknown> | null | undefined)?.[head]
  if (rest.length === 0) return next
  return getPath(next, restPath)
}

function adfToPlainText(node: unknown): string {
  const out: string[] = []
  const walk = (n: unknown): void => {
    if (n == null || typeof n !== 'object') return
    const rec = n as { text?: unknown; content?: unknown; type?: unknown }
    if (typeof rec.text === 'string') out.push(rec.text)
    if (Array.isArray(rec.content)) {
      rec.content.forEach(walk)
      if (rec.type === 'paragraph') out.push('\n')
    }
  }
  walk(node)
  return out.join('').trim()
}

export const transforms: Record<TransformName, (v: unknown) => unknown> = {
  stripHtml: (v) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '') : v),
  adfToPlainText: (v) => adfToPlainText(v),
  toString: (v) => (v == null ? v : String(v)),
  count: (v) => (Array.isArray(v) ? v.length : v == null ? 0 : 1),
  firstLine: (v) => (typeof v === 'string' ? v.split('\n')[0] : v)
}

export function applyResponseMap(
  payloads: Record<string, unknown>,
  entries: MapEntry[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const e of entries) {
    const src = payloads[e.source ?? 'main']
    if (src === undefined) continue
    let v = getPath(src, e.from)
    if (e.transform) {
      const fn = transforms[e.transform]
      v = Array.isArray(v) && e.transform !== 'count' ? v.map(fn) : fn(v)
    }
    if (v !== undefined) out[e.to] = v
  }
  return out
}
