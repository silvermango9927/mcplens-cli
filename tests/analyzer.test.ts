import { describe, expect, it } from 'vitest'
import { heuristicAnalyze } from '../src/analyzer/analyzer.js'
import { loadRecordedSamples } from '../src/sampler/sampler.js'
import { loadOpenApiSpec } from '../src/spec/loader.js'

describe('heuristicAnalyze', () => {
  it('curates useful endpoints and maps lean fields from samples', async () => {
    const spec = await loadOpenApiSpec('tests/fixtures/bloated-api/openapi.json')
    const samples = await loadRecordedSamples('tests/fixtures/bloated-api/samples')
    const analysis = heuristicAnalyze(spec, samples)
    expect(analysis.tools.map((t) => t.name)).toContain('get_issue')
    expect(analysis.hiddenEndpoints.some((e) => e.endpoint === 'GET /avatars/{id}')).toBe(true)
    const getIssue = analysis.tools.find((t) => t.name === 'get_issue')
    expect(getIssue?.responseMap.map((m) => m.to)).toContain('summary')
    expect(getIssue?.responseMap.map((m) => m.to)).toContain('status')
  })
})
