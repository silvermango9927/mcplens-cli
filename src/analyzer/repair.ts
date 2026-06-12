import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { AnthropicLlmClient, type LlmClient } from './client.js'

export interface RepairResult {
  repaired: boolean
  reason: string
  files: string[]
}

export interface RepairGeneratedProjectOptions {
  client?: LlmClient
}

const RepairSchema = z.array(
  z.object({
    path: z.string().min(1),
    content: z.string()
  })
)

const SYSTEM_PROMPT = [
  'You fix TypeScript compile errors in generated MCP server projects.',
  'You receive tsc output and the full contents of the failing files.',
  'Return only a JSON array of objects: [{"path":"src/file.ts","content":"full corrected file contents"}].',
  'Change as little as possible.',
  'Only return files that were provided in the prompt.'
].join('\n')

export function extractErrorFiles(output: string): string[] {
  const files = new Set<string>()
  for (const match of output.matchAll(/^([^\s()]+\.ts)\(\d+,\d+\): error TS\d+:/gm)) {
    files.add(path.normalize(match[1]))
  }
  return [...files]
}

export async function repairGeneratedProject(
  projectDir: string,
  tscOutput: string,
  options: RepairGeneratedProjectOptions = {}
): Promise<RepairResult> {
  if (!options.client && !process.env.ANTHROPIC_API_KEY) {
    return {
      repaired: false,
      reason: 'ANTHROPIC_API_KEY is not set; generated artifacts are left in place for inspection.',
      files: []
    }
  }
  const client = options.client ?? new AnthropicLlmClient()
  const files = await repairProject(projectDir, tscOutput, client)
  return {
    repaired: files.length > 0,
    reason: files.length > 0 ? `Repaired ${files.length} generated file(s).` : 'No generated files were repaired.',
    files
  }
}

export async function repairProject(projectDir: string, tscOutput: string, client: LlmClient): Promise<string[]> {
  const errorFiles = extractErrorFiles(tscOutput)
  if (errorFiles.length === 0) {
    throw new Error(`tsc failed but no TypeScript file paths were found:\n${tscOutput.slice(0, 1000)}`)
  }

  const allowedFiles = new Set(errorFiles)
  const fileBlocks = await Promise.all(
    errorFiles.map(async (file) => {
      assertSafeRelativePath(file, allowedFiles)
      return `=== ${file} ===\n${await readFile(path.join(projectDir, file), 'utf8')}`
    })
  )
  const userPrompt = [
    'tsc output:',
    tscOutput.slice(0, 6000),
    '',
    'Failing files:',
    fileBlocks.join('\n\n')
  ].join('\n')

  const fixes = RepairSchema.parse(extractJson(await client.complete(SYSTEM_PROMPT, userPrompt)))
  const written: string[] = []
  for (const fix of fixes) {
    const normalized = path.normalize(fix.path)
    assertSafeRelativePath(normalized, allowedFiles)
    await writeFile(path.join(projectDir, normalized), fix.content)
    written.push(normalized)
  }
  return written
}

function assertSafeRelativePath(filePath: string, allowedFiles: Set<string>): void {
  if (path.isAbsolute(filePath) || filePath.startsWith('..') || filePath.includes(`${path.sep}..${path.sep}`)) {
    throw new Error(`Repair tried to write outside the project: ${filePath}`)
  }
  if (!allowedFiles.has(filePath)) {
    throw new Error(`Repair tried to write an unexpected file: ${filePath}`)
  }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith('[')) return JSON.parse(trimmed)
  const match = trimmed.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON array found in repair response')
  return JSON.parse(match[0])
}
