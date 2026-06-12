import { describe, expect, it } from 'vitest'
import { loadRecordedSamples } from '../src/sampler/sampler.js'

describe('loadRecordedSamples', () => {
  it('loads sample wrapper files', async () => {
    const samples = await loadRecordedSamples('tests/fixtures/bloated-api/samples')
    expect(samples).toHaveLength(1)
    expect(samples[0].endpoint).toBe('GET /issues/{id}')
    expect(samples[0].bytes).toBeGreaterThan(100)
  })
})
