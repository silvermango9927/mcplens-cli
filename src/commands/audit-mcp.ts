import path from 'node:path'
import { buildAuditCapabilities } from '../audit/capabilities.js'
import { loadAuditPolicy } from '../audit/config.js'
import { loadAuditLogs, loadMissedPrompts, loadToolsList } from '../audit/loaders.js'
import { buildAuditReport } from '../audit/recommend.js'
import { renderMarkdownReport } from '../audit/report.js'
import { readJsonFile, writeJsonFile, writeTextFile } from '../util/fs.js'

export interface AuditMcpCommandOptions {
  toolsList: string
  logs?: string
  missedPrompts?: string
  config?: string
  baseline?: string
  out?: string
  json?: string
  capabilities?: string
  offline?: boolean
  ci?: boolean
}

export async function runAuditMcpCommand(options: AuditMcpCommandOptions): Promise<number> {
  if (!options.offline) {
    console.warn('audit-mcp is deterministic/offline in this version; no LLM calls will be made.')
  }
  const toolsListPath = path.resolve(options.toolsList)
  const policy = await loadAuditPolicy(options.config)
  const loadedTools = await loadToolsList(toolsListPath)
  const logs = options.logs ? await loadAuditLogs(path.resolve(options.logs)) : []
  const missedPrompts = options.missedPrompts ? await loadMissedPrompts(path.resolve(options.missedPrompts)) : []
  const baselineReport = options.baseline ? await readJsonFile(path.resolve(options.baseline)) : undefined
  const report = buildAuditReport({
    tools: loadedTools.tools,
    logs,
    missedPrompts,
    manifestBytes: loadedTools.manifestBytes,
    policy,
    baselineReport
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

  if (options.ci) {
    printCiSummary(report, {
      markdownPath: options.out ? path.resolve(options.out) : undefined,
      jsonPath: options.json ? path.resolve(options.json) : undefined
    })
  }

  return options.ci && report.ci.status === 'fail' ? 1 : 0
}

function printCiSummary(
  report: ReturnType<typeof buildAuditReport>,
  paths: {
    markdownPath?: string
    jsonPath?: string
  }
): void {
  console.log('')
  console.log('mcplens audit-mcp CI summary')
  console.log(`Tools: ${report.summary.toolCount}`)
  const delta = report.baseline ? ` (${formatSignedNumber(report.baseline.scoreDelta)} from baseline)` : ''
  console.log(`Average score: ${report.summary.averageScore}${delta}`)
  console.log(`Findings: ${report.ci.info} info, ${report.ci.warn} warn, ${report.ci.fail} fail`)
  for (const finding of report.findings.filter((item) => item.severity === 'fail')) {
    console.log('')
    console.log(`FAIL ${finding.id}${finding.tool ? ` ${finding.tool}` : ''}`)
    console.log(finding.message)
  }
  if (paths.markdownPath) console.log(`\nReport: ${paths.markdownPath}`)
  if (paths.jsonPath) console.log(`JSON: ${paths.jsonPath}`)
}

function formatSignedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}
