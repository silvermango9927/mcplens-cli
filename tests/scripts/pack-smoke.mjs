import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const tempDir = await mkdtemp(path.join(tmpdir(), 'agentify-pack-smoke-'))

try {
  const pack = await execFileAsync('npm', ['pack', '--json', '--pack-destination', tempDir], { cwd: repoRoot })
  const [packed] = JSON.parse(pack.stdout)
  if (!packed?.filename || !Array.isArray(packed.files)) throw new Error(`Unexpected npm pack output: ${pack.stdout}`)

  const packedFiles = new Set(packed.files.map((file) => file.path))
  for (const required of ['dist/cli.js', 'dist/codegen/generate.js', 'src/mapping/runtime.ts', 'README.md', 'package.json']) {
    if (!packedFiles.has(required)) throw new Error(`npm pack did not include ${required}`)
  }

  const installDir = path.join(tempDir, 'install')
  await mkdir(installDir)
  const tarball = path.join(tempDir, packed.filename)
  await execFileAsync('npm', ['install', '--silent', tarball], { cwd: installDir })

  const agentifyBin = path.join(installDir, 'node_modules', '.bin', process.platform === 'win32' ? 'agentify.cmd' : 'agentify')
  const help = await execFileAsync(agentifyBin, ['--help'], { cwd: installDir })
  if (!help.stdout.includes('compile') || !help.stdout.includes('build')) {
    throw new Error(`Installed agentify --help did not list expected commands:\n${help.stdout}`)
  }

  console.log(`Pack smoke test passed: ${packed.filename}`)
} finally {
  await rm(tempDir, { recursive: true, force: true })
}
