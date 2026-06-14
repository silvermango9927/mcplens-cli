import { describe, expect, it } from 'vitest'
import { applyResponseMap } from '../src/mapping/runtime.js'
import { ManifestSchema, type ManifestTool } from '../src/manifest/schema.js'
import { readJsonFile } from '../src/util/fs.js'

interface SampleFile {
  response: unknown
}

describe('example manifest semantic curation', () => {
  it('keeps the core GitHub issue fields agents need', async () => {
    const lean = await leanSample('github', 'issues_get', 'get-issue.json')

    expect(lean).toMatchObject({
      number: 1347,
      title: 'Found a bug: pagination skips the last page when per_page divides evenly',
      state: 'open'
    })
    expect(String(lean.body)).toContain('When the total number of results')
    expect(Object.keys(lean).filter((key) => key.endsWith('url'))).toHaveLength(0)
  })

  it('keeps the core Google Calendar event fields agents need', async () => {
    const lean = await leanSample('google-calendar', 'events_get', 'get-event.json')

    expect(lean).toMatchObject({
      status: 'confirmed',
      summary: 'Q3 Roadmap Planning & Living Brain Sync',
      start_dateTime: '2026-06-15T10:00:00-07:00',
      end_dateTime: '2026-06-15T11:30:00-07:00'
    })
  })

  it('keeps the core Notion page fields agents need', async () => {
    const lean = await leanSample('notion', 'pages_get', 'get-page.json')

    expect(lean.title).toContain('Q3 Launch Retrospective')
    expect(lean.status).toBe('In Progress')
  })

  it('keeps the core Slack user fields agents need', async () => {
    const lean = await leanSample('slack', 'users_info', 'users-info.json')

    expect(lean).toMatchObject({
      user_id: 'W012A3CDE',
      user_name: 'spengler',
      real_name: 'Egon Spengler',
      email: 'spengler@ghostbusters.example.com'
    })
  })

  it('keeps the core Stripe customer fields agents need', async () => {
    const lean = await leanSample('stripe', 'customers_get', 'get-customer.json')

    expect(lean).toMatchObject({
      id: 'cus_Qh7Xa92LkPq3Zt',
      name: 'Acme Corporation',
      email: 'billing@acme-corp.example.com',
      description: 'Acme Corporation primary billing contact'
    })
  })
})

async function leanSample(api: string, toolName: string, sampleName: string): Promise<Record<string, unknown>> {
  const manifest = ManifestSchema.parse(await readJsonFile(`examples/${api}/agentify.manifest.json`))
  const sample = await readJsonFile<SampleFile>(`examples/${api}/samples/${sampleName}`)
  const tool = findTool(manifest.tools, toolName)
  return applyResponseMap({ main: sample.response }, tool.responseMap) as Record<string, unknown>
}

function findTool(tools: ManifestTool[], name: string): ManifestTool {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Missing example tool ${name}`)
  return tool
}
