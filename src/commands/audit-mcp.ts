import path from 'node:path'
import { buildAuditCapabilities } from '../audit/capabilities.js'
import { loadAuditLogs, loadMissedPrompts, loadToolsList } from '../audit/loaders.js'
import { buildAuditReport } from '../audit/recommend.js'
import { renderMarkdownReport } from '../audit/report.js'
import { writeJsonFile, writeTextFile } from '../util/fs.js'

export interface AuditMcpCommandOptions {
  toolsList: string
  logs?: string
  missedPrompts?: string
  out?: string
  json?: string
  capabilities?: string
  offline?: boolean
}

export async function runAuditMcpCommand(options: AuditMcpCommandOptions): Promise<void> {
  if (!options.offline) {
    console.warn('audit-mcp is deterministic/offline in this version; no LLM calls will be made.')
  }
  const toolsListPath = path.resolve(options.toolsList)
  const loadedTools = await loadToolsList(toolsListPath)
  const logs = options.logs ? await loadAuditLogs(path.resolve(options.logs)) : []
  const missedPrompts = options.missedPrompts ? await loadMissedPrompts(path.resolve(options.missedPrompts)) : []
  const report = buildAuditReport({
    tools: loadedTools.tools,
    logs,
    missedPrompts,
    manifestBytes: loadedTools.manifestBytes
  })

  if (options.json) {
    const jsonPath = path.resolve(options.json)
    await writeJsonFile(jsonPath, report)
    console.log(`Wrote JSON audit report ${jsonPath}`)
  }

  if (options.capabilities) {
    const capabilitiesPath = path.resolve(options.capabilities)
    await writeJsonFile(capabilitiesPath, buildAuditCapabilities(report))
    console.log(`Wrote MCP capabilities plan ${capabilitiesPath}`)
  }

  const markdown = renderMarkdownReport(report)
  if (options.out) {
    const outPath = path.resolve(options.out)
    await writeTextFile(outPath, markdown)
    console.log(`Wrote MCP activation audit ${outPath}`)
  } else {
    process.stdout.write(markdown)
  }
}
