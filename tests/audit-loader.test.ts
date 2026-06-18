import { describe, expect, it } from 'vitest'
import { loadAuditLogs, loadMissedPrompts, loadToolsList, normalizeToolsList } from '../src/audit/loaders.js'

describe('audit loaders', () => {
  it('normalizes MCP tools/list response shapes', () => {
    const tools = normalizeToolsList({
      result: {
        tools: [
          {
            name: 'search_learnings',
            description: 'Search learnings',
            input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
            _meta: { priorityHint: 1 }
          }
        ]
      }
    })
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      name: 'search_learnings',
      inputSchema: { type: 'object' },
      _meta: { priorityHint: 1 }
    })
  })

  it('loads Push-Realm-like fixtures and log aliases', async () => {
    const loaded = await loadToolsList('tests/fixtures/mcp-activation/tools-list.json')
    const logs = await loadAuditLogs('tests/fixtures/mcp-activation/events.jsonl')
    const prompts = await loadMissedPrompts('tests/fixtures/mcp-activation/missed-prompts.json')
    expect(loaded.tools.map((tool) => tool.name)).toContain('submit_learning')
    expect(loaded.manifestBytes).toBeGreaterThan(1000)
    expect(logs.find((event) => event.type === 'tools/call' && event.tool === 'search_learnings')).toBeTruthy()
    expect(logs.find((event) => event.type === 'tools/list')?.sessionId).toBe('s1')
    expect(prompts[0].expectedTools).toEqual(['search_learnings'])
  })
})
