import type { PartialAnalysis } from './schema.js'
import { ManifestSchema, type Manifest } from './schema.js'
import type { LoadedSpec } from '../spec/loader.js'

export function assembleManifest(spec: LoadedSpec, analysis: PartialAnalysis): Manifest {
  return ManifestSchema.parse({
    agentifyVersion: 1,
    api: { name: spec.title, baseUrl: spec.baseUrl, auth: spec.auth },
    tools: analysis.tools,
    hiddenEndpoints: analysis.hiddenEndpoints
  })
}
