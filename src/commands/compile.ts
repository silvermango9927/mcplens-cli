import path from 'node:path'
import { analyzeApi } from '../analyzer/analyzer.js'
import { assembleManifest } from '../manifest/assemble.js'
import { formatTokenSavingsReport, estimateTokenSavings } from '../report/tokens.js'
import { loadSamples } from '../sampler/sampler.js'
import { loadOpenApiSpec } from '../spec/loader.js'
import { writeJsonFile } from '../util/fs.js'

export interface CompileCommandOptions {
  spec: string
  baseUrl?: string
  samples?: string
  out?: string
  liveSamples?: boolean
  offline?: boolean
}

export async function runCompileCommand(options: CompileCommandOptions): Promise<void> {
  const spec = await loadOpenApiSpec(options.spec, options.baseUrl)
  const samples = await loadSamples(spec, {
    samplesDir: options.samples,
    live: Boolean(options.liveSamples),
    maxLiveSamples: 5
  })
  if (!options.offline && !process.env.ANTHROPIC_API_KEY) {
    console.warn('ANTHROPIC_API_KEY is not set; using offline heuristic analysis.')
  }
  if (samples.length > 0 && !options.offline && process.env.ANTHROPIC_API_KEY) {
    console.warn('Recorded samples are sent to Anthropic during compile. Avoid production data you cannot share.')
  }
  const analysis = await analyzeApi(spec, samples, { offline: options.offline })
  const manifest = assembleManifest(spec, analysis)
  const out = path.resolve(options.out ?? 'agentify.manifest.json')
  await writeJsonFile(out, manifest)
  console.log(`Wrote ${out}`)
  console.log(formatTokenSavingsReport(estimateTokenSavings(manifest, samples)))
}
