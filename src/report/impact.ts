import type { Manifest } from '../manifest/schema.js'
import type { Sample } from '../sampler/sampler.js'
import { estimateTokenSavings, type TokenSavingsReport } from './tokens.js'

export interface ImpactToolSummary {
  name: string
  endpoints: string[]
  responseFieldCount: number
}

export interface ImpactSummary {
  apiName: string
  toolCount: number
  hiddenEndpointCount: number
  tools: ImpactToolSummary[]
  tokenSavings: TokenSavingsReport
}

export function buildImpactSummary(manifest: Manifest, samples: Sample[]): ImpactSummary {
  return {
    apiName: manifest.api.name,
    toolCount: manifest.tools.length,
    hiddenEndpointCount: manifest.hiddenEndpoints.length,
    tools: manifest.tools.map((tool) => ({
      name: tool.name,
      endpoints: tool.requests.map((request) => `${request.method} ${request.path}`),
      responseFieldCount: tool.responseMap.length
    })),
    tokenSavings: estimateTokenSavings(manifest, samples)
  }
}
