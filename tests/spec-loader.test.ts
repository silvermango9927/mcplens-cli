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

  it('loads simple JSON request body properties as body params', async () => {
    const spec = await loadOpenApiSpec('tests/fixtures/request-body/openapi.json')
    const createIssue = spec.endpoints.find((e) => e.operationId === 'createIssue')
    const updateIssue = spec.endpoints.find((e) => e.operationId === 'updateIssue')

    expect(createIssue?.params).toEqual([
      { name: 'owner', in: 'path', type: 'string', required: true, description: 'Repository owner' },
      { name: 'repo', in: 'path', type: 'string', required: true, description: 'Repository name' },
      { name: 'title', in: 'body', type: 'string', required: true, description: 'Issue title' },
      { name: 'body', in: 'body', type: 'string', required: false, description: 'Issue body' },
      { name: 'labels', in: 'body', type: 'string[]', required: false, description: 'Issue labels' }
    ])
    expect(createIssue?.params.some((param) => param.name === 'metadata')).toBe(false)
    expect(updateIssue?.params).toContainEqual({
      name: 'issue_number',
      in: 'path',
      type: 'number',
      required: true,
      description: ''
    })
    expect(updateIssue?.params).toContainEqual({
      name: 'body',
      in: 'body',
      type: 'string',
      required: false,
      description: ''
    })
  })
})
