import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function readJsonFile<T = unknown>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export async function writeTextFile(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, value.endsWith('\n') ? value : `${value}\n`)
}

export async function listFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = []
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const p = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(p)
      else if (entry.isFile()) out.push(p)
    }
  }
  await walk(dir)
  return out.sort()
}
