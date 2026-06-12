import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ManifestSchema, ToolSchema } from '../src/manifest/schema.js'

const validTool = {
  name: 'get_issue',
  description: 'Fetch an issue',
  params: [{ name: 'id', in: 'path', type: 'string', required: true, description: 'Issue id' }],
  requests: [
    { key: 'main', method: 'GET', path: '/issues/{id}' },
    { key: 'comments', method: 'GET', path: '/issues/{id}/comments' }
  ],
  responseMap: [
    { from: 'fields.status.name', to: 'status', reason: 'state only' },
    { from: 'comments[].bodyHtml', to: 'comments', source: 'comments', transform: 'stripHtml', reason: 'text only' }
  ]
}

describe('ToolSchema', () => {
  it('accepts a valid tool and defaults source to main', () => {
    const t = ToolSchema.parse(validTool)
    expect(t.responseMap[0].source).toBe('main')
  })
  it('rejects a tool without a main request', () => {
    expect(() => ToolSchema.parse({ ...validTool, requests: [validTool.requests[1]] })).toThrow(/main/)
  })
  it('rejects duplicate request keys', () => {
    expect(() => ToolSchema.parse({ ...validTool, requests: [validTool.requests[0], validTool.requests[0]] })).toThrow(/unique/)
  })
  it('rejects a reserved include param on multi-request tools', () => {
    expect(() => ToolSchema.parse({
      ...validTool,
      params: [...validTool.params, { name: 'include', in: 'query', type: 'string', required: false, description: '' }]
    })).toThrow(/reserved/)
  })
  it('rejects responseMap sources with no matching request', () => {
    expect(() => ToolSchema.parse({
      ...validTool,
      responseMap: [{ from: 'a', to: 'b', source: 'nope', reason: '' }]
    })).toThrow(/no matching request/)
  })
})

describe('ManifestSchema', () => {
  it('accepts a full manifest', () => {
    const m = ManifestSchema.parse({
      agentifyVersion: 1,
      api: { name: 'Trackly', baseUrl: 'https://api.trackly.example', auth: { type: 'bearer', envVar: 'TRACKLY_API_TOKEN' } },
      tools: [validTool],
      hiddenEndpoints: [{ endpoint: 'GET /avatars/{id}', reason: 'UI asset' }]
    })
    expect(m.tools).toHaveLength(1)
  })
  it('rejects basic auth missing env vars', () => {
    expect(() => ManifestSchema.parse({
      agentifyVersion: 1,
      api: { name: 'X', baseUrl: 'https://x.example', auth: { type: 'basic' } },
      tools: [validTool]
    })).toThrow()
  })
  it('golden trackly manifest parses', () => {
    ManifestSchema.parse(JSON.parse(readFileSync('tests/fixtures/trackly.manifest.json', 'utf8')))
  })
})
