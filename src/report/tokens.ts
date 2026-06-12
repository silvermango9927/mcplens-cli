import { applyResponseMap } from '../mapping/runtime.js'
import type { Manifest } from '../manifest/schema.js'
import type { Sample } from '../sampler/sampler.js'

export interface TokenSavingsRow {
  tool: string
  endpoint: string
  rawBytes: number
  leanBytes: number
  estimatedRawTokens: number
  estimatedLeanTokens: number
}

export interface TokenSavingsReport {
  rows: TokenSavingsRow[]
  rawTokens: number
  leanTokens: number
  savedTokens: number
  savedPercent: number
}

export function estimateTokenSavings(manifest: Manifest, samples: Sample[]): TokenSavingsReport {
  const byEndpoint = new Map(samples.map((s) => [s.endpoint, s]))
  const rows: TokenSavingsRow[] = []
  for (const tool of manifest.tools) {
    const main = tool.requests.find((r) => r.key === 'main')
    if (!main) continue
    const endpoint = `${main.method} ${main.path}`
    const sample = byEndpoint.get(endpoint)
    if (!sample) continue
    const lean = applyResponseMap({ main: sample.response }, tool.responseMap)
    const rawBytes = Buffer.byteLength(JSON.stringify(sample.response))
    const leanBytes = Buffer.byteLength(JSON.stringify(lean))
    rows.push({
      tool: tool.name,
      endpoint,
      rawBytes,
      leanBytes,
      estimatedRawTokens: estimateTokens(rawBytes),
      estimatedLeanTokens: estimateTokens(leanBytes)
    })
  }
  const rawTokens = rows.reduce((sum, row) => sum + row.estimatedRawTokens, 0)
  const leanTokens = rows.reduce((sum, row) => sum + row.estimatedLeanTokens, 0)
  const savedTokens = Math.max(0, rawTokens - leanTokens)
  const savedPercent = rawTokens === 0 ? 0 : Math.round((savedTokens / rawTokens) * 100)
  return { rows, rawTokens, leanTokens, savedTokens, savedPercent }
}

export function estimateTokens(bytes: number): number {
  return Math.ceil(bytes / 4)
}

export function formatTokenSavingsReport(report: TokenSavingsReport): string {
  if (report.rows.length === 0) return 'No sample payloads matched generated tools; token savings report unavailable.'
  const lines = [
    'Estimated token savings from recorded samples:',
    ...report.rows.map(
      (r) => `- ${r.tool} (${r.endpoint}): ${r.estimatedRawTokens} -> ${r.estimatedLeanTokens} tokens`
    ),
    `Total: ${report.rawTokens} -> ${report.leanTokens} tokens (${report.savedPercent}% saved)`
  ]
  return lines.join('\n')
}
