#!/usr/bin/env node
import { Command } from 'commander'
import { runBuildCommand } from './commands/build.js'
import { runCompileCommand } from './commands/compile.js'

const program = new Command()

program
  .name('agentify')
  .description('Compile bloated OpenAPI-backed APIs into lean MCP servers')
  .version('0.1.0')

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
