import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const tempDir = await mkdtemp(path.join(tmpdir(), 'mcplens-pack-smoke-'))
const npmEnv = { ...process.env }
delete npmEnv.npm_config_dry_run
delete npmEnv.NPM_CONFIG_DRY_RUN

try {
  const pack = await execFileAsync('npm', ['pack', '--json', '--pack-destination', tempDir], { cwd: repoRoot, env: npmEnv })
  const [packed] = JSON.parse(pack.stdout)
  if (!packed?.filename || !Array.isArray(packed.files)) throw new Error(`Unexpected npm pack output: ${pack.stdout}`)

  const packedFiles = new Set(packed.files.map((file) => file.path))
  for (const required of [
    'dist/cli.js',
    'dist/codegen/generate.js',
    'src/mapping/runtime.ts',
    'README.md',
    'GUIDE.md',
    'IMPACT.md',
    'CHANGELOG.md',
    'LICENSE',
    'docs/audit-mcp-ci.md',
    'examples/generic-mcp/report.md',
    'examples/browser-mcp/report.md',
    'examples/large-mcp/report.md',
    'package.json'
  ]) {
    if (!packedFiles.has(required)) throw new Error(`npm pack did not include ${required}`)
  }

  const installDir = path.join(tempDir, 'install')
  await mkdir(installDir)
  const tarball = path.join(tempDir, packed.filename)
  await execFileAsync('npm', ['install', '--silent', tarball], { cwd: installDir, env: npmEnv })

  const binPath = (name) =>
    path.join(installDir, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name)

  // The primary `mcplens` binary must list audit-mcp first, then compile and build.
  const mcplensHelp = await execFileAsync(binPath('mcplens'), ['--help'], { cwd: installDir })
  for (const command of ['audit-mcp', 'compile', 'build']) {
    if (!mcplensHelp.stdout.includes(command)) {
      throw new Error(`Installed mcplens --help did not list ${command}:\n${mcplensHelp.stdout}`)
    }
  }

  // The legacy `agentify` alias binary must remain runnable and expose the same surface.
  const agentifyHelp = await execFileAsync(binPath('agentify'), ['--help'], { cwd: installDir })
  if (!agentifyHelp.stdout.includes('audit-mcp')) {
    throw new Error(`Installed agentify --help did not list audit-mcp:\n${agentifyHelp.stdout}`)
  }

  // Run the installed CLI against the bundled MCP activation fixture and confirm it
  // writes the report artifacts without any network access.
  const fixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'mcp-activation')
  const outDir = path.join(tempDir, 'audit-out')
  await mkdir(outDir)
  const reportMd = path.join(outDir, 'activation-report.md')
  const reportJson = path.join(outDir, 'activation-report.json')
  const capabilities = path.join(outDir, 'mcp-capabilities.json')
  await execFileAsync(
    binPath('mcplens'),
    [
      'audit-mcp',
      '--tools-list', path.join(fixtureDir, 'tools-list.json'),
      '--logs', path.join(fixtureDir, 'events.jsonl'),
      '--missed-prompts', path.join(fixtureDir, 'missed-prompts.json'),
      '--out', reportMd,
      '--json', reportJson,
      '--capabilities', capabilities,
      '--offline'
    ],
    { cwd: installDir }
  )

  const markdown = await readFile(reportMd, 'utf8')
  if (!markdown.includes('MCP Activation Audit')) {
    throw new Error(`audit-mcp markdown report missing expected heading:\n${markdown.slice(0, 200)}`)
  }
  const parsedJson = JSON.parse(await readFile(reportJson, 'utf8'))
  if (parsedJson?.summary?.toolCount !== 13) {
    throw new Error(`audit-mcp JSON report had unexpected toolCount: ${parsedJson?.summary?.toolCount}`)
  }
  const parsedCapabilities = JSON.parse(await readFile(capabilities, 'utf8'))
  if (parsedCapabilities?.agentifyCapabilitiesVersion !== 1) {
    throw new Error(`audit-mcp capabilities plan had unexpected version: ${parsedCapabilities?.agentifyCapabilitiesVersion}`)
  }

  console.log(`Pack smoke test passed: ${packed.filename}`)
} finally {
  await rm(tempDir, { recursive: true, force: true })
}
