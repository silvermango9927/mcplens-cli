import { spawn } from 'node:child_process'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

export interface VerifyResult {
  ok: boolean
  stage: 'install' | 'build' | 'smoke'
  output: string
}

export async function verifyGeneratedProject(projectDir: string): Promise<VerifyResult> {
  const install = await run('install', 'npm', ['install'], projectDir)
  if (!install.ok) return install
  const build = await run('build', 'npm', ['run', 'build'], projectDir)
  if (!build.ok) return build
  const smoke = await smokeTest(projectDir)
  if (!smoke.ok) return smoke
  return { ok: true, stage: 'smoke', output: [install.output, build.output, smoke.output].join('\n') }
}

async function smokeTest(projectDir: string): Promise<VerifyResult> {
  const client = new Client({ name: 'agentify-verifier', version: '0.1.0' })
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(projectDir, 'dist/index.js')],
    cwd: projectDir,
    stderr: 'pipe'
  })
  try {
    await client.connect(transport)
    const tools = await client.listTools()
    await client.close()
    return { ok: tools.tools.length > 0, stage: 'smoke', output: `MCP smoke test listed ${tools.tools.length} tools` }
  } catch (err) {
    await client.close().catch(() => undefined)
    return { ok: false, stage: 'smoke', output: err instanceof Error ? err.message : String(err) }
  }
}

function run(stage: VerifyResult['stage'], command: string, args: string[], cwd: string): Promise<VerifyResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('close', (code) => resolve({ ok: code === 0, stage, output }))
    child.on('error', (err) => resolve({ ok: false, stage, output: err.message }))
  })
}
