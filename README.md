# agentify

Compile a bloated OpenAPI-backed REST API into a lean, agent-optimized TypeScript MCP
server.

`agentify` uses an LLM once at compile time to curate tools and field mappings, writes
those decisions to an editable manifest, and then deterministically generates hard-coded
TypeScript transforms. The generated MCP server makes no LLM calls at runtime.

## Commands

Requires Node.js 20 or newer.

```sh
npm install
npm run build
```

Compile a spec plus optional recorded samples:

```sh
npm run cli -- compile \
  --spec tests/fixtures/bloated-api/openapi.json \
  --samples tests/fixtures/bloated-api/samples \
  --impact-report impact-report.json \
  --out agentify.manifest.json
```

If `ANTHROPIC_API_KEY` is set, `compile` calls Anthropic for the build-time analysis.
Without it, or with `--offline`, the CLI uses deterministic heuristics so the MVP can be
tested locally.
Use `--impact-report <path>` to write a JSON report with tool counts, hidden endpoint
counts, and token savings estimates for matched samples.

Generate and verify a standalone MCP server:

```sh
npm run cli -- build --manifest agentify.manifest.json --out ./trackly-mcp
```

The build command writes the project, runs `npm install`, runs `tsc`, and smoke-tests
MCP `tools/list` over stdio. Use `--no-verify` to only emit files.

## Package Smoke Test

Before handing off a release tarball, run:

```sh
npm run smoke:pack
```

That command builds `dist`, runs `npm pack`, verifies the tarball includes the CLI and
the generated-server mapping runtime, installs the tarball into a temporary project, and
runs `agentify --help`.

The equivalent manual flow is:

```sh
npm run build
npm pack
npm install -g ./agentify-*.tgz
agentify --help
```

## Sample Payload Format

Recorded sample files are JSON wrappers:

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

Generated projects default to stdio:

```sh
npm start
```

They also include Streamable HTTP support:

```sh
MCP_TRANSPORT=http PORT=3000 npm start
```

Set upstream credentials using the env vars inferred into `agentify.manifest.json`.
