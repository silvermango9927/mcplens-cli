import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { listFilesRecursive } from '../util/fs.js'
import { endpointKey } from '../spec/condense.js'
import type { LoadedEndpoint, LoadedSpec } from '../spec/loader.js'

export interface Sample {
  endpoint: string
  response: unknown
  file?: string
  bytes: number
}

export interface LoadSamplesOptions {
  samplesDir?: string
  live?: boolean
  maxLiveSamples?: number
}

export async function loadSamples(spec: LoadedSpec, options: LoadSamplesOptions = {}): Promise<Sample[]> {
  const recorded = options.samplesDir ? await loadRecordedSamples(options.samplesDir) : []
  if (!options.live) return recorded
  const live = await captureLiveSamples(spec, options.maxLiveSamples ?? 5)
  return [...recorded, ...live]
}

export async function loadRecordedSamples(samplesDir: string): Promise<Sample[]> {
  const files = (await listFilesRecursive(samplesDir)).filter((f) => f.endsWith('.json'))
  const out: Sample[] = []
  for (const file of files) {
    const raw = await readFile(file, 'utf8')
    const parsed = JSON.parse(raw)
    if (typeof parsed?.endpoint === 'string' && 'response' in parsed) {
      out.push({ endpoint: parsed.endpoint, response: parsed.response, file, bytes: Buffer.byteLength(raw) })
    } else {
      out.push({ endpoint: endpointFromFile(file), response: parsed, file, bytes: Buffer.byteLength(raw) })
    }
  }
  return out
}

async function captureLiveSamples(spec: LoadedSpec, max: number): Promise<Sample[]> {
  const candidates = spec.endpoints.filter((e) => e.method === 'GET' && e.params.every((p) => !p.required || p.in !== 'path'))
  const out: Sample[] = []
  for (const endpoint of candidates.slice(0, max)) {
    try {
      const url = new URL(endpoint.path, spec.baseUrl)
      const res = await fetch(url, { headers: authHeaders(spec) })
      if (!res.ok) continue
      const response = await res.json()
      out.push({ endpoint: endpointKey(endpoint), response, bytes: Buffer.byteLength(JSON.stringify(response)) })
    } catch {
      // Live sampling is best-effort; compile can proceed with recorded samples or spec only.
    }
  }
  return out
}

function authHeaders(spec: LoadedSpec): Record<string, string> {
  const auth = spec.auth
  if (auth.type === 'bearer') {
    const token = process.env[auth.envVar]
    return token ? { Authorization: `Bearer ${token}` } : {}
  }
  if (auth.type === 'header') {
    const token = process.env[auth.envVar]
    return token ? { [auth.header]: token } : {}
  }
  if (auth.type === 'basic') {
    const user = process.env[auth.userEnvVar]
    const pass = process.env[auth.passEnvVar]
    return user && pass ? { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` } : {}
  }
  return {}
}

function endpointFromFile(file: string): string {
  const stem = path.basename(file, '.json').replace(/__/g, '/').replace(/_/g, ' ')
  return stem.includes(' ') ? stem.toUpperCase() : stem
}
