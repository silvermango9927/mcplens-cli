import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Manifest } from '../manifest/schema.js'
import { writeTextFile } from '../util/fs.js'
import { toolFileSource } from './tool-file.js'
import { configTemplate, indexTemplate, packageJsonTemplate, readmeTemplate, tsconfigTemplate, upstreamTemplate } from './templates.js'

export async function generateProject(manifest: Manifest, outDir: string): Promise<void> {
  await writeTextFile(path.join(outDir, 'package.json'), packageJsonTemplate(manifest))
  await writeTextFile(path.join(outDir, 'tsconfig.json'), tsconfigTemplate())
  await writeTextFile(path.join(outDir, 'README.md'), readmeTemplate(manifest))
  await writeTextFile(path.join(outDir, 'src/index.ts'), indexTemplate(manifest))
  await writeTextFile(path.join(outDir, 'src/lib/config.ts'), configTemplate(manifest))
  await writeTextFile(path.join(outDir, 'src/lib/upstream.ts'), upstreamTemplate(manifest))
  await writeTextFile(path.join(outDir, 'src/lib/mapping.ts'), await readFile(new URL('../mapping/runtime.ts', import.meta.url), 'utf8'))
  for (const tool of manifest.tools) {
    await writeTextFile(path.join(outDir, `src/tools/${tool.name}.ts`), toolFileSource(manifest, tool))
  }
}
