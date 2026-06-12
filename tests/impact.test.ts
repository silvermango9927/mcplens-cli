import { describe, expect, it } from 'vitest'
import { ManifestSchema } from '../src/manifest/schema.js'
import { buildImpactSummary } from '../src/report/impact.js'
import { loadRecordedSamples } from '../src/sampler/sampler.js'
import { readJsonFile } from '../src/util/fs.js'

describe('buildImpactSummary', () => {
  it('summarizes curation and token savings for matched samples', async () => {
    const manifest = ManifestSchema.parse(await readJsonFile('tests/fixtures/trackly.manifest.json'))
    const samples = await loadRecordedSamples('tests/fixtures/bloated-api/samples')
    const summary = buildImpactSummary(manifest, samples)
    expect(summary).toMatchObject({
      apiName: 'Trackly',
      toolCount: 1,
      hiddenEndpointCount: 2,
      tokenSavings: {
        rawTokens: 198,
        leanTokens: 55,
        savedTokens: 143,
        savedPercent: 72
      }
    })
    expect(summary.tools).toEqual([
      {
        name: 'get_issue',
        endpoints: ['GET /issues/{id}'],
        responseFieldCount: 7
      }
    ])
  })
})
