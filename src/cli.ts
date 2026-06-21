#!/usr/bin/env node
import { Command } from 'commander'
import { runAuditMcpCommand } from './commands/audit-mcp.js'
import { runBuildCommand } from './commands/build.js'
import { runCompileCommand } from './commands/compile.js'

const program = new Command()

program
  .name('mcplens')
  .description('Audit MCP tool activation locally and compile bloated APIs into lean MCP servers')
  .version('0.1.2')

program
  .command('audit-mcp')
  .summary('Audit an MCP server\'s tool activation surface (local/offline)')
  .description('Audit an existing MCP tools/list surface and observed usage logs, fully local and offline')
  .requiredOption('--tools-list <path>', 'MCP tools/list response or bare tool array')
  .option('--logs <path>', 'JSONL file of MCP/session events')
  .option('--missed-prompts <path>', 'JSON or JSONL prompts where a tool should have been called')
  .option('--config <path>', 'mcplens.config.json policy file')
  .option('--baseline <path>', 'Previous audit JSON report for regression comparison')
  .option('--out <path>', 'Markdown audit report output path')
  .option('--json <path>', 'Machine-readable audit report output path')
  .option('--capabilities <path>', 'Machine-readable recommended MCP capability/profile plan output path')
  .option('--ci', 'Enable CI summary and return nonzero when configured fail findings exist')
  .option('--offline', 'Run deterministic offline audit (currently the only mode)')
  .action(async (opts) => {
    const exitCode = await runAuditMcpCommand(opts)
    if (exitCode !== 0) process.exitCode = exitCode
  })

program
  .command('compile')
  .description('Analyze an OpenAPI spec and optional samples into agentify.manifest.json')
  .requiredOption('--spec <path>', 'OpenAPI 3.x JSON/YAML spec')
  .option('--base-url <url>', 'Override upstream base URL')
  .option('--samples <dir>', 'Directory of recorded JSON samples')
  .option('--out <path>', 'Manifest output path', 'agentify.manifest.json')
  .option('--live-samples', 'Best-effort live capture of simple GET endpoints')
  .option('--offline', 'Use deterministic heuristic analysis instead of Anthropic')
  .option('--impact-report <path>', 'Write a machine-readable token savings and curation report')
  .action(async (opts) => runCompileCommand(opts))

program
  .command('build')
  .description('Generate a TypeScript MCP server from an agentify manifest')
  .option('--manifest <path>', 'Manifest path', 'agentify.manifest.json')
  .option('--out <dir>', 'Generated project output directory')
  .option('--no-verify', 'Skip npm install, tsc, and MCP stdio smoke test')
  .action(async (opts) => runBuildCommand(opts))

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
