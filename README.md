# MCPLens

MCPLens helps MCP server builders see whether agents can actually discover and use the
right tools.

The main command, `audit-mcp`, runs locally against an MCP `tools/list` export and
optional usage logs. It writes a report that highlights low-discoverability tools,
overlapping capabilities, profile boundaries, description improvements, and missing
instrumentation.

MCPLens can also generate a lean TypeScript MCP server from an OpenAPI-backed REST API.
That path is useful when you want to turn a large API surface into a smaller,
agent-oriented MCP server with slimmer responses.

## Quick Start

Run an audit with `npx`:

```sh
npx mcplens-cli audit-mcp --tools-list tools.json --logs events.jsonl --out report.md
```

Requires Node.js 20 or newer.

Common audit inputs:

- `--tools-list <path>`: an MCP `tools/list` response or a bare tool array. Required.
- `--logs <path>`: JSONL file of MCP/session events. Optional.
- `--missed-prompts <path>`: JSON or JSONL prompts where a tool should have fired. Optional.
- `--config <path>`: `mcplens.config.json` policy file for profiles, severities, and thresholds. Optional.
- `--baseline <path>`: previous audit JSON for regression comparison. Optional.
- `--out <path>`: Markdown report output. Without it, the report prints to stdout.
- `--json <path>`: machine-readable audit report.
- `--capabilities <path>`: machine-readable capability recommendations.
- `--ci`: print a concise CI summary and return nonzero when configured failure rules trigger.

## Privacy

The audit path is local and offline by design:

- No network requests.
- No LLM calls.
- No telemetry.
- Only the files you pass in are read.
- Only the output paths you name are written.

Your tool definitions, logs, and prompts stay on your machine.

## What It Does Today

`audit-mcp` writes reports and recommendation artifacts. It does not modify an existing
MCP server in place.

The audit report can identify:

- Tools that are hard for agents to discover.
- Tool descriptions that are vague or overlapping.
- Confirm/reject fanout and related workflow friction.
- Which tools look like `core`, `admin`, or contextual capabilities.
- Safer naming and description rewrites.
- Instrumentation events that would make future activation failures easier to debug.

To emit structured artifacts alongside the Markdown report:

```sh
npx mcplens-cli audit-mcp \
  --tools-list tools.json \
  --logs events.jsonl \
  --missed-prompts missed-prompts.json \
  --out activation-report.md \
  --json activation-report.json \
  --capabilities mcp-capabilities.json
```

For CI usage with `mcplens.config.json`, severities, baseline regression checks, and a
GitHub Actions example, see [docs/audit-mcp-ci.md](docs/audit-mcp-ci.md).

## Install

Use `npx` without installing:

```sh
npx mcplens-cli --help
```

Or install the CLI globally:

```sh
npm install -g mcplens-cli
mcplens --help
mcplens audit-mcp --tools-list tools.json --out report.md
```

The package also installs an `agentify` binary as a compatibility alias for older scripts.

## OpenAPI To MCP

MCPLens includes an advanced flow for turning an OpenAPI spec into a standalone MCP
server:

```sh
npx mcplens-cli compile \
  --spec examples/stripe/openapi.json \
  --samples examples/stripe/samples \
  --impact-report stripe-impact.json \
  --out agentify.manifest.json \
  --offline

npx mcplens-cli build --manifest agentify.manifest.json --out ./stripe-mcp
```

`compile` writes an editable manifest describing the tools, upstream requests, response
maps, and hidden endpoints. With `ANTHROPIC_API_KEY` set, it can use an LLM once at build
time for better curation. With `--offline`, it uses deterministic heuristics.

`build` generates a standalone TypeScript MCP server, installs dependencies, type-checks
the project, and smoke-tests MCP `tools/list` over stdio. The generated server makes no
LLM calls at runtime.

Generated projects include:

- `README.md` with setup, stdio, HTTP, Docker Compose, and client connection notes.
- `ACTIVATE.md` with activation steps for the generated output directory.
- `mcp-client.config.json` with a ready-to-copy `mcpServers` stdio config.
- `mcp-activation.json` with machine-readable activation metadata.
- `.env.example` for transport, HTTP token, upstream base URL, and credentials.
- `Dockerfile` and `docker-compose.yml` for self-hosting.

See [GUIDE.md](GUIDE.md) for the full OpenAPI-to-MCP walkthrough and [IMPACT.md](IMPACT.md)
for measured token and tool-surface reductions on representative API fixtures.

## Examples

The [`examples/`](examples/) directory contains small, reviewable fixtures modeled on
public API documentation for GitHub, Stripe, Slack, Google Calendar, and Notion.

Regenerate the example reports:

```sh
for api in github stripe slack google-calendar notion; do
  npx mcplens-cli compile \
    --spec "examples/$api/openapi.json" \
    --samples "examples/$api/samples" \
    --impact-report "examples/$api/impact-report.json" \
    --out "examples/$api/agentify.manifest.json" \
    --offline
done
```

## Development

From a repo checkout:

```sh
npm install
npm run build
npm test
npm run smoke:pack
```
