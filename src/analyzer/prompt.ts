import { condenseSpec } from '../spec/condense.js'
import type { LoadedSpec } from '../spec/loader.js'
import type { Sample } from '../sampler/sampler.js'

export function buildSystemPrompt(): string {
  return [
    'You compile bloated REST APIs into lean MCP tool manifests for AI agents.',
    'Return only valid JSON. Do not include markdown fences.',
    'Expose a curated, consolidated set of agent-useful tools, not every endpoint.',
    'Drop UI-only fields, duplicated render metadata, avatars, icon URLs, webhooks, and admin plumbing.',
    'Keep stable identifiers, human-readable status/title/name fields, timestamps, URLs, owners, and concise content.',
    'Every tool must have exactly one request with key "main". Secondary requests are allowed for consolidation.',
    'The responseMap source must match one request key. The default source is "main".',
    'Allowed transforms: stripHtml, adfToPlainText, toString, count, firstLine.'
  ].join('\n')
}

export function buildUserPrompt(spec: LoadedSpec, samples: Sample[]): string {
  return [
    'Produce JSON with this exact top-level shape:',
    '{"tools":[...],"hiddenEndpoints":[...]}',
    '',
    'Tool shape:',
    '{"name":"snake_case","description":"...","params":[{"name":"id","in":"path|query|body","type":"string|number|boolean|string[]","required":true,"description":"..."}],"requests":[{"key":"main","method":"GET","path":"/path/{id}"}],"responseMap":[{"from":"field.path","to":"leanName","source":"main","transform":"stripHtml","reason":"..."}]}',
    '',
    'Condensed OpenAPI spec:',
    condenseSpec(spec),
    '',
    'Recorded response samples:',
    JSON.stringify(samples.map((s) => ({ endpoint: s.endpoint, response: truncateSample(s.response) })), null, 2)
  ].join('\n')
}

function truncateSample(value: unknown): unknown {
  const json = JSON.stringify(value)
  if (json.length <= 40_000) return value
  return { truncatedJsonPrefix: json.slice(0, 40_000), note: 'Sample truncated for prompt size' }
}
