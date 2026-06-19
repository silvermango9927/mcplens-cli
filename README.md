# MCPLens

Audit and tighten an MCP server's tool-activation surface — and compile bloated
OpenAPI-backed REST APIs into lean, agent-optimized TypeScript MCP servers.

The most important command is `audit-mcp`. It runs **fully local and offline**: it reads
your `tools/list` surface and usage logs from disk, analyzes them with deterministic
heuristics, and writes a report. No tool definitions, logs, or prompts ever leave your
machine, and no network or LLM calls are made.

> MCPLens was previously published as `agentify`. The `agentify` binary is kept as a
> legacy alias, so existing scripts keep working.

## Quick Start: audit an MCP server

Run it directly with `npx`, no install required (Node.js 20+):

```sh
npx mcplens audit-mcp --tools-list tools.json --logs events.jsonl --out report.md
```

- `--tools-list <path>` — an MCP `tools/list` response or a bare tool array (required).
- `--logs <path>` — JSONL file of MCP/session events (optional).
- `--missed-prompts <path>` — JSON or JSONL prompts where a tool should have fired (optional).
- `--out <path>` — Markdown report output; without it the report prints to stdout.
- `--json <path>` — machine-readable audit report.
- `--capabilities <path>` — machine-readable recommended capability/profile plan.
- `--offline` — deterministic offline audit (this is the only mode today).

### Privacy: everything stays on your machine

`audit-mcp` is local-first by design:

- It only reads the files you point it at and only writes the output paths you name.
- It makes **no network requests** and **no LLM calls** — even without `--offline`,
  there is currently no remote mode.
- There is **no telemetry**. Your tool definitions, logs, and prompts are never uploaded.

The report identifies low-discoverability tools, confirm/reject fanout, workflow groups,
profile recommendations such as `core` vs `admin`, safer tool description rewrites, and
missing contribution-funnel instrumentation.

### Export a machine-readable capabilities plan

Add `--json` and `--capabilities` to emit structured artifacts alongside the Markdown:

```sh
npx mcplens audit-mcp \
  --tools-list tools.json \
  --logs events.jsonl \
  --missed-prompts missed-prompts.json \
  --out activation-report.md \
  --json activation-report.json \
  --capabilities mcp-capabilities.json \
  --offline
```

The `--capabilities` file is a machine-readable plan with recommended core/admin
profiles, rewritten capability names and descriptions, priority hints, exposure guidance
for contextual tools, and instrumentation events to add next.

## Other commands

Requires Node.js 20 or newer. From a repo checkout:

```sh
npm install
npm run build
```

### compile — OpenAPI spec → manifest

```sh
npm run cli -- compile \
  --spec tests/fixtures/bloated-api/openapi.json \
  --samples tests/fixtures/bloated-api/samples \
  --impact-report impact-report.json \
  --out agentify.manifest.json
```

`compile` uses an LLM once at build time to curate tools and field mappings, then writes
those decisions to an editable manifest. If `ANTHROPIC_API_KEY` is set, `compile` calls
Anthropic for the build-time analysis. Without it, or with `--offline`, the CLI uses
deterministic heuristics so the MVP can be tested locally. Use `--impact-report <path>`
to write a JSON report with tool counts, hidden endpoint counts, and token-savings
estimates for matched samples.

### build — manifest → standalone MCP server

```sh
npm run cli -- build --manifest agentify.manifest.json --out ./trackly-mcp
```

The build command writes the project, runs `npm install`, runs `tsc`, and smoke-tests
MCP `tools/list` over stdio. Use `--no-verify` to only emit files. The generated MCP
server makes no LLM calls at runtime. The generated folder includes `ACTIVATE.md`,
`mcp-client.config.json`, and `mcp-activation.json` so you can enable the MCP server in a
client without hand-writing absolute paths or credential env var names.

## Install

Run without installing via `npx mcplens ...`, or install globally:

```sh
npm install -g mcplens
mcplens --help
mcplens audit-mcp --tools-list tools.json --out report.md
```

The legacy `agentify` binary is installed alongside `mcplens` and accepts the same
commands:

```sh
agentify --help
```

### Install from a local tarball

To install the package produced by this repo without publishing:

```sh
npm run build
npm pack
npm install -g ./mcplens-*.tgz
mcplens --help
```

## Package Smoke Test

Before handing off a release tarball, run:

```sh
npm run smoke:pack
```

That command builds `dist`, runs `npm pack`, verifies the tarball includes the CLI and
the generated-server mapping runtime, installs the tarball into a temporary project, runs
`mcplens --help` and the legacy `agentify --help`, and runs `mcplens audit-mcp` against
the bundled MCP activation fixture to confirm it writes the report artifacts.

## Sample Payload Format

Recorded sample files for `compile` are JSON wrappers:

```json
{
  "endpoint": "GET /issues/{id}",
  "response": { "id": "ISS-123" }
}
```

Samples let the analyzer see real payload bloat and produce better `responseMap`
entries. The compile command prints an estimated token-savings report for samples that
match generated tools.

## Generated Server

Generated projects are standalone TypeScript MCP servers. Each generated project includes:

- `README.md` with setup, stdio, HTTP, Docker Compose, and client connection notes.
- `ACTIVATE.md` with generated activation steps for the exact output directory.
- `mcp-client.config.json` with a ready-to-copy `mcpServers` stdio config.
- `mcp-activation.json` with machine-readable stdio, Claude Code, and HTTP activation metadata.
- `.env.example` listing transport, HTTP token, upstream base URL, and inferred auth env vars.
- `Dockerfile` and `docker-compose.yml` for self-hosting.
- `src/lib/config.ts` runtime validation that fails fast when required env vars are missing.

Generated projects default to stdio, which is the safest mode for local MCP clients:

```sh
cd ./trackly-mcp
npm install
npm run build
npm start
```

To activate the server in a client, open the generated `ACTIVATE.md`. For clients that
accept an `mcpServers` object, copy `mcp-client.config.json` and replace placeholder
credentials. For Claude Code, use the generated `claude mcp add ...` command in
`ACTIVATE.md`.

They also include Streamable HTTP support for self-hosting:

```sh
export MCP_TRANSPORT=http
export HOST=127.0.0.1
export PORT=3000
export MCP_HTTP_TOKEN=replace-with-a-long-random-token
npm start
```

HTTP mode serves MCP at `/mcp` and requires:

```http
Authorization: Bearer $MCP_HTTP_TOKEN
```

It also exposes `/healthz` and `/readyz` for health checks. Do not expose `/mcp` to the
public internet without a strong token, TLS, and a reverse proxy or firewall that you
control.

For Docker Compose:

```sh
cd ./trackly-mcp
cp .env.example .env
# edit .env and replace MCP_HTTP_TOKEN plus any upstream credentials
docker compose up --build
```
