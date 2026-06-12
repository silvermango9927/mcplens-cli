import path from 'node:path'
import { generateProject } from '../codegen/generate.js'
import { ManifestSchema } from '../manifest/schema.js'
import { readJsonFile } from '../util/fs.js'
import { verifyGeneratedProject } from '../verifier/verify.js'
import { repairGeneratedProject } from '../analyzer/repair.js'

export interface BuildCommandOptions {
  manifest?: string
  out?: string
  verify?: boolean
}

export async function runBuildCommand(options: BuildCommandOptions): Promise<void> {
  const manifestPath = path.resolve(options.manifest ?? 'agentify.manifest.json')
  const manifest = ManifestSchema.parse(await readJsonFile(manifestPath))
  const outDir = path.resolve(options.out ?? `${slug(manifest.api.name)}-mcp`)
  await generateProject(manifest, outDir)
  console.log(`Generated ${outDir}`)
  if (options.verify === false) return

  const result = await verifyGeneratedProject(outDir)
  if (result.ok) {
    console.log(result.output)
    console.log('Generated project verified.')
    return
  }
  const repair = await repairGeneratedProject()
  throw new Error(`Generated project verification failed.\n${result.output}\n${repair.reason}`)
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'agentified-api'
}
