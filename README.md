# agentify

Compile a bloated OpenAPI-backed REST API into a lean, agent-optimized TypeScript MCP
server.

`agentify` uses an LLM once at compile time to curate tools and field mappings, writes
those decisions to an editable manifest, and then deterministically generates hard-coded
TypeScript transforms. The generated MCP server makes no LLM calls at runtime.

## Commands

Requires Node.js 20 or newer.

From a repo checkout:

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

## Install From A Tarball

Until `agentify` is published to npm, you can install the package produced by this repo:

```sh
npm run build
npm pack
npm install -g ./agentify-*.tgz
agentify --help
```

After global install, use the CLI without `npm run cli --`. Point it at your own
OpenAPI spec and optional recorded samples:

```sh
agentify compile \
  --spec ./openapi.json \
  --samples ./samples \
  --impact-report impact-report.json \
  --out agentify.manifest.json

agentify build --manifest agentify.manifest.json --out ./trackly-mcp
```

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

Generated projects are standalone TypeScript MCP servers. Each generated project includes:

- `README.md` with setup, stdio, HTTP, Docker Compose, and client connection notes.
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
