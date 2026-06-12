import { describe, expect, it } from 'vitest'
import { loadOpenApiSpec } from '../src/spec/loader.js'

describe('loadOpenApiSpec', () => {
  it('loads endpoints, base URL, params, and bearer auth', async () => {
    const spec = await loadOpenApiSpec('tests/fixtures/bloated-api/openapi.json')
    expect(spec.title).toBe('Trackly')
    expect(spec.baseUrl).toBe('https://api.trackly.example')
    expect(spec.auth).toEqual({ type: 'bearer', envVar: 'TRACKLY_API_TOKEN' })
    expect(spec.endpoints.map((e) => `${e.method} ${e.path}`)).toContain('GET /issues/{id}')
    expect(spec.endpoints.find((e) => e.path === '/issues/{id}')?.params[0]).toMatchObject({
      name: 'id',
      in: 'path',
      required: true
    })
  })
})
