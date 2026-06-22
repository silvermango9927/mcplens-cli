# MCPLens — Build Your Own MCP Server from Any API

This is a step-by-step guide for turning a bloated REST API into a lean, agent-optimized
**MCP (Model Context Protocol) server** that you can plug into Claude, Cursor, or any other
MCP client.

You bring an **OpenAPI spec** (the machine-readable description of an API). MCPLens helps
pick the tools worth exposing, strips the junk out of every response, writes those
decisions to an editable manifest, and generates a standalone TypeScript MCP server you can
run anywhere.

---

## What you'll end up with

```
your API's OpenAPI spec  --->  mcplens compile  --->  agentify.manifest.json  (editable)
                                                            │
                                                            ▼
                                                     mcplens build
                                                            │
                                                            ▼
                                          a standalone MCP server (its own folder)
                                                            │
                                                            ▼
                                       connect it to Claude / Cursor / any MCP client
```

Two facts worth knowing up front:

- **The LLM is used at most once, at build time** — to curate tools and field mappings. The
  generated server makes **zero LLM calls at runtime**. It's plain, fast, deterministic
  TypeScript.
- **Responses get 76–85% smaller.** A single GitHub issue drops from ~7.8 KB to ~1.3 KB
  because the generated server strips out the dozens of URL fields, avatar variants, and
  metadata blocks an agent never needs. (See `IMPACT.md` for the full numbers.)

---

## 1. Prerequisites

| You need | Why | Check |
|----------|-----|-------|
| **Node.js 20 or newer** | Runtime for the CLI and the generated server | `node --version` |
| **An OpenAPI 3.x spec** (JSON or YAML) | The description of the API you want to wrap | see [Step 3](#3-get-an-openapi-spec-for-your-api) |
| *(Optional)* **`ANTHROPIC_API_KEY`** | Better tool/field curation via Claude | [Anthropic Console](https://console.anthropic.com/) |

You do **not** need an API key to try MCPLens — it falls back to deterministic
heuristics. The key just produces a better-curated server.

---

## 2. Install MCPLens

You can run MCPLens directly with `npx`:

```sh
npx mcplens-cli --help
```

Or install it globally:

```sh
npm install -g mcplens-cli
mcplens --help
```

If you want to run from a repo checkout:

```sh
git clone https://github.com/silvermango9927/mcplens-cli.git
cd mcplens-cli
npm install
npm run build
```

---

## 3. Get an OpenAPI spec for your API

MCPLens reads a standard **OpenAPI 3.x** document. Most popular APIs publish one:

- **GitHub:** <https://github.com/github/rest-api-description>
- **Stripe:** <https://github.com/stripe/openapi>
- **Your own service:** frameworks like FastAPI, NestJS, and Spring generate one at a
  `/openapi.json` route.

Save it locally, e.g. `my-api.json`. YAML works too (`my-api.yaml`).

Don't have one yet? Use a bundled fixture to learn the flow first:

```sh
ls examples/          # github, stripe, slack, google-calendar, notion
ls tests/fixtures/bloated-api/openapi.json
```

---

## 4. *(Optional but recommended)* Record sample responses

Samples are real (or realistic) response payloads. They let MCPLens see exactly which
fields are bloat, so it produces a sharper response map and a more accurate token-savings
report.

Each sample is a small JSON file in this wrapper format:

```json
{
  "endpoint": "GET /v1/customers/{customer}",
  "response": { "id": "cus_123", "name": "Ada Lovelace", "...": "..." }
}
```

- `endpoint` must match an operation in your spec (`METHOD /path`).
- `response` is a representative body returned by that endpoint.

Put all sample files in one directory, e.g. `my-samples/`. One sample per endpoint is
plenty. See `examples/stripe/samples/get-customer.json` for a complete example.

> ⚠️ **Privacy:** when `ANTHROPIC_API_KEY` is set, sample payloads are sent to Anthropic at
> compile time. Don't use production data you aren't allowed to share. Use `--offline` to
> keep everything local.

---

## 5. Compile: spec → manifest

This is the one step where the LLM (optionally) gets involved. It analyzes your spec and
samples and writes an editable `agentify.manifest.json`.

```sh
npx mcplens-cli compile \
  --spec my-api.json \
  --samples my-samples \
  --impact-report impact-report.json \
  --out agentify.manifest.json
```

| Flag | Meaning |
|------|---------|
| `--spec <path>` | **Required.** Your OpenAPI 3.x JSON/YAML file. |
| `--samples <dir>` | Directory of recorded sample files (Step 4). |
| `--out <path>` | Where to write the manifest. Default: `agentify.manifest.json`. |
| `--base-url <url>` | Override the upstream base URL from the spec. |
| `--impact-report <path>` | Also write a machine-readable token-savings + curation report. |
| `--offline` | Skip Anthropic entirely; use deterministic heuristics. Fully reproducible. |
| `--live-samples` | Best-effort live capture of simple `GET` endpoints (advanced). |

**With vs. without an API key:**

- `ANTHROPIC_API_KEY` set → Claude curates the tool list and picks semantically correct
  fields. Best results.
- No key (or `--offline`) → keyword heuristics decide. Good as a baseline, but it may keep
  a not-ideal field or miss an endpoint that should be hidden. (See "Caveats" in
  `IMPACT.md`.)

You'll see a token-savings summary printed to your terminal, for example:

```
Wrote /…/agentify.manifest.json
Estimated token savings from recorded samples:
- customers_get (GET /v1/customers/{customer}): 487 -> 99 tokens
Total: 487 -> 99 tokens (80% saved)
```

---

## 6. Review & edit the manifest (the important part)

The manifest is **meant to be edited by hand.** This is where you, the human, get the final
say over what your MCP server exposes. Open `agentify.manifest.json` and check:

```jsonc
{
  "agentifyVersion": 1,
  "api": {
    "name": "Stripe",
    "baseUrl": "https://api.stripe.com",
    "auth": { "type": "bearer", "envVar": "STRIPE_API_TOKEN" }   // ← how the server authenticates
  },
  "tools": [
    {
      "name": "customers_get",                 // ← the tool name the agent sees
      "description": "Retrieve a customer",     // ← shown to the agent; make it clear
      "params": [ /* path / query / body inputs */ ],
      "requests": [ { "key": "main", "method": "GET", "path": "/v1/customers/{customer}" } ],
      "responseMap": [                          // ← ONLY these fields survive; everything else is dropped
        { "from": "id",    "to": "id" },
        { "from": "name",  "to": "name" },
        { "from": "email", "to": "email" }
      ]
    }
  ],
  "hiddenEndpoints": [ /* endpoints intentionally not exposed to the agent */ ]
}
```

Things you'll commonly tweak:

- **Sharpen tool descriptions** — the agent chooses tools based on these.
- **Trim or add `responseMap` entries** — `from` is the path in the upstream response (dot
  notation, `labels[].name` for arrays); `to` is the field name the agent receives. Apply a
  `transform` (`stripHtml`, `adfToPlainText`, `firstLine`, `count`, `toString`) when useful.
- **Move noise into `hiddenEndpoints`** — admin/webhook/upload routes the agent shouldn't
  see.
- **Confirm `api.auth`** — see [Step 8](#8-configure-credentials).

The auth block is one of these shapes:

| `auth.type` | Generated behavior | Env var(s) you set |
|-------------|--------------------|--------------------|
| `bearer` | `Authorization: Bearer <token>` | `envVar` |
| `header` | Custom header carries the token | `envVar` |
| `basic` | HTTP Basic auth | `userEnvVar`, `passEnvVar` |
| `none` | No auth | — |

---

## 7. Build: manifest → MCP server

This generates a standalone TypeScript project, installs its dependencies, type-checks it,
and runs a smoke test that lists the tools over MCP stdio.

```sh
npx mcplens-cli build --manifest agentify.manifest.json --out ./my-mcp
```

| Flag | Meaning |
|------|---------|
| `--manifest <path>` | Manifest to build from. Default: `agentify.manifest.json`. |
| `--out <dir>` | Output folder. Default: `<api-name>-mcp`. |
| `--no-verify` | Only emit files — skip `npm install`, `tsc`, and the smoke test. |

A successful build ends with:

```
Generated /…/my-mcp
MCP smoke test listed 8 tools
Generated project verified.
```

The generated project is self-contained and looks like this:

```
my-mcp/
├── package.json
├── tsconfig.json
├── ACTIVATE.md             # exact activation steps for this output directory
├── mcp-client.config.json  # ready-to-copy mcpServers snippet
├── mcp-activation.json     # machine-readable activation metadata
├── README.md              # run instructions specific to this server
└── src/
    ├── index.ts           # stdio + Streamable HTTP entry point
    ├── lib/
    │   ├── upstream.ts     # fetch + auth to the real API
    │   └── mapping.ts      # deterministic response-shrinking transforms
    └── tools/             # one file per tool
        ├── customers_get.ts
        └── …
```

It depends only on the MCP SDK and `zod` — no MCPLens package and no LLM SDK at runtime.

---

## 8. Configure credentials

The generated server talks to the real upstream API, so it needs the same credentials you'd
use directly. Set the env var(s) named in your manifest's `api.auth` block.

```sh
# Example for a bearer-auth API (envVar: STRIPE_API_TOKEN)
export STRIPE_API_TOKEN="sk_live_…"
```

Optional runtime overrides understood by the generated server:

| Env var | Purpose | Default |
|---------|---------|---------|
| `AGENTIFY_BASE_URL` | Override the upstream base URL (e.g. point at a sandbox) | manifest `baseUrl` |
| `MCP_TRANSPORT` | `http` to serve over Streamable HTTP; otherwise stdio | stdio |
| `MCP_HTTP_TOKEN` | Bearer token required by HTTP mode | none |
| `PORT` | HTTP port when `MCP_TRANSPORT=http` | `3000` |

---

## 9. Run the server

From inside the generated folder (`cd my-mcp`):

**Stdio (default — this is what most MCP clients launch):**

```sh
npm start
```

**Streamable HTTP (for serving over a network):**

```sh
MCP_TRANSPORT=http MCP_HTTP_TOKEN=replace-with-a-long-random-token PORT=3000 npm start
# serves MCP at http://localhost:3000/mcp
```

Clients must send `Authorization: Bearer $MCP_HTTP_TOKEN`. Do not expose `/mcp` directly
to the public internet without TLS, a strong token, and a trusted reverse proxy or
firewall.

---

## 10. Connect it to an MCP client

Open the generated `ACTIVATE.md` first. It contains paths and commands for the exact
output directory you built.

Most clients launch the server over stdio. `mcp-client.config.json` contains a
ready-to-copy `mcpServers` object that points at the built entry file
(`my-mcp/dist/index.js`) with `node` and includes the inferred credential env vars.

**Claude Desktop** — add to `claude_desktop_config.json`
(`~/Library/Application Support/Claude/` on macOS):

```json
{
  "mcpServers": {
    "stripe": {
      "command": "node",
      "args": ["/absolute/path/to/my-mcp/dist/index.js"],
      "env": { "STRIPE_API_TOKEN": "sk_live_…" }
    }
  }
}
```

**Claude Code** (CLI):

```sh
claude mcp add stripe --env STRIPE_API_TOKEN=sk_live_… -- node /absolute/path/to/my-mcp/dist/index.js
```

The generated `ACTIVATE.md` prints this command with your server name and absolute
entrypoint path filled in.

Restart the client, and your curated tools (`customers_get`, `customers_list`, …) appear,
returning lean responses.

> Use **absolute paths** — clients don't run from your shell's working directory. The
> `dist/` folder exists because `mcplens build` ran `tsc` for you (skip this only if you
> used `--no-verify`, in which case run `npm install && npm run build` inside `my-mcp`
> first).

---

## 11. Audit an existing MCP server

If you already have an MCP server, `audit-mcp` can inspect its `tools/list` surface and
optional usage logs without requiring an OpenAPI spec:

```sh
npx mcplens-cli audit-mcp \
  --tools-list path/to/tools-list.json \
  --logs path/to/mcp-events.jsonl \
  --missed-prompts path/to/missed-prompts.json \
  --out activation-report.md \
  --json activation-report.json \
  --capabilities mcp-capabilities.json \
  --offline
```

The Markdown and JSON reports explain activation friction, workflow fanout, weak tool
descriptions, profile recommendations, and contribution-funnel instrumentation to add.
The optional `--capabilities` file contains machine-readable recommendations for
core/admin profiles, rewritten capability names and descriptions, priority hints, and
contextual exposure guidance for helper tools such as `confirm_*` and `reject_*`.

For CI, prefer warn-only mode so the audit nudges maintainers to review concrete tool
descriptions without blocking urgent deployments:

```sh
npx mcplens-cli audit-mcp \
  --tools-list path/to/tools-list.json \
  --out activation-report.md \
  --json activation-report.json \
  --ci \
  --warn-only
```

Use strict `--ci` without `--warn-only` only when you explicitly want configured fail
findings to return a nonzero exit code.

---

## End-to-end example (copy-paste)

Wrap the bundled Stripe fixture and run it, with no API key required:

```sh
# from a mcplens-cli repo checkout

# 1. compile (offline = no Anthropic key needed)
npx mcplens-cli compile \
  --spec examples/stripe/openapi.json \
  --samples examples/stripe/samples \
  --impact-report stripe-impact.json \
  --out stripe.manifest.json \
  --offline

# 2. (open stripe.manifest.json, tidy up tool descriptions / responseMap)

# 3. build the server
npx mcplens-cli build --manifest stripe.manifest.json --out ./stripe-mcp

# 4. give it credentials and run
cd stripe-mcp
export STRIPE_API_TOKEN="sk_test_…"
npm start
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `ANTHROPIC_API_KEY is not set; using offline heuristic analysis.` | Expected without a key. Set the key for better curation, or pass `--offline` to silence it. |
| Build fails on `tsc` | The build auto-attempts up to 2 repairs. If it still fails, the error names the file — check a hand-edited `responseMap`/`params` in your manifest. |
| Tools return upstream errors (401/403) | Your credential env var is missing or wrong. Confirm the var name matches `api.auth` in the manifest and is exported in the server's environment. |
| Hitting the wrong host | Set `AGENTIFY_BASE_URL`, or re-compile with `--base-url`. |
| Want files only, no install/build | Add `--no-verify` to `build`, then `npm install && npm run build` in the output folder yourself. |
| Sample isn't counted in the savings report | Its `endpoint` string must exactly match an operation that became a tool (`METHOD /path`). |

---

## Reference

- **`README.md`** — concise command reference.
- **`IMPACT.md`** — measured token/tool savings across five public-API fixtures, plus
  honest caveats about offline vs. LLM curation.
- **`examples/`** — five ready-to-inspect specs, samples, manifests, and impact reports.

That's the whole loop: **spec → compile → edit → build → run → connect.** Wrap any API your
agents touch, and stop paying for response bloat on every single call.
