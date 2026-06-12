# agentify V1 — Design Spec

**Date:** 2026-06-12
**Status:** Approved
**Repo:** agent-middleware

## Problem

Enterprise APIs (Jira, Salesforce, HubSpot, GitHub) were built for human-facing UIs. Their
payloads are bloated: a single Jira issue GET returns 50–100KB of JSON where an agent needs
~10 fields. AI agents calling these APIs waste thousands of input tokens per call, and a
naive "one MCP tool per endpoint" mapping wastes thousands more on tool schemas.

## Product

`agentify` — a generator CLI (npm package, run via `npx`) that any API-serving company
points at their OpenAPI spec (plus optional sample payloads) to produce a lean,
agent-optimized **TypeScript MCP server** they own and deploy themselves.

**Core architectural bet:** a big-context LLM (Claude) is used exactly **once, at build
time**, to analyze the API and decide what agents need. The output of that analysis is a
human-editable manifest, from which **deterministic codegen** emits hard-coded TypeScript
transform functions. The generated server runs at machine speed with **zero LLM calls at
runtime**.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Form factor | Generator CLI; customer owns and deploys the output (no hosted infra in V1) |
| Input | OpenAPI 3.x spec required; sample payloads optional (recorded dir or live GET-only capture) |
| Leanness authority | LLM proposes; decisions recorded in an editable manifest; `build` is deterministic from manifest |
| Tool bloat | Curation (10–30 agent-useful tools, not 200) + consolidation (fold related endpoints into parameterized tools). Generic `call_api` escape hatch **deferred** |
| Output | TypeScript MCP server, official `@modelcontextprotocol/sdk`, stdio + streamable-HTTP |
| Build-time LLM access | BYO `ANTHROPIC_API_KEY`, direct Anthropic SDK calls from the CLI |
| Validation targets | Jira (flagship demo), GitHub (generality proof, spec-condensing stress test) |

## CLI UX

```
npx agentify compile --spec openapi.json [--base-url https://api.x.com --samples ./samples]
npx agentify build  [--out ./my-api-mcp]
```

- **`compile`** (the one LLM step): parse spec → gather samples → Claude analysis →
  write `agentify.manifest.json`. Prints a **token-savings report** (estimated tokens of
  raw sample payloads vs. lean transforms, per endpoint and total).
- **`build`** (no LLM): generate the complete MCP server project from manifest + spec.
  Edit manifest → re-run `build` → updated code in seconds, zero API cost.

Sample gathering: `--samples` accepts a directory of recorded JSON responses; or, given
`--base-url` + an API token env var, the CLI live-fetches a handful of GET-only endpoints
(chosen heuristically from the spec). Both optional; spec-only compile works but warns
that field decisions are schema-informed only. The CLI warns that samples are sent to the
Anthropic API (don't capture unshareable production data).

## Compile pipeline

1. **Spec ingestion** — parse + dereference OpenAPI 3.x using an existing parser library.
   Specs too large for one context window (GitHub ≈ 10MB) are condensed: strip verbose
   descriptions/examples, batch by resource group across multiple LLM calls, merge results.
2. **Sampling** — load recorded samples and/or live-fetch GET-only endpoints.
3. **LLM analysis** — Claude receives condensed spec + samples; emits the manifest:
   endpoint curation (expose/hide with reasons), consolidation (endpoint folding into
   parameterized tools), and per-tool response field mappings (keep/rename/flatten/drop,
   each with a one-line reason). Output validated against a JSON Schema; bounded retry
   (max 3) on invalid output.
4. **Manifest written** — the single contract between the LLM half and the deterministic half.

## Manifest format

`agentify.manifest.json` — auditable and human-editable:

```jsonc
{
  "api": { "name": "Jira", "baseUrl": "...", "authScheme": "header:Authorization" },
  "tools": [{
    "name": "get_issue",
    "description": "Fetch a Jira issue with its essential fields",
    "endpoints": ["GET /rest/api/3/issue/{issueIdOrKey}"],
    "inputs": { /* lean JSON Schema */ },
    "responseMap": [
      { "from": "fields.status.name", "to": "status", "reason": "agent needs state, not the status object" },
      { "from": "fields.description", "to": "description", "transform": "adfToPlainText" }
    ]
  }],
  "hiddenEndpoints": [{ "endpoint": "GET /rest/api/3/avatar/...", "reason": "UI asset, never agent-relevant" }]
}
```

Companies flip a hidden endpoint to a tool or add a field to a `responseMap`, re-run
`build`, done — no LLM call needed for edits.

## Generated artifact

A standalone TypeScript project the customer owns:

- `@modelcontextprotocol/sdk`, stdio + streamable-HTTP transports
- `src/tools/<tool>.ts` — one file per tool: zod input schema, fetch call(s) to the
  upstream API, and a plain hard-coded transform function (pick/flatten/rename).
  Readable, auditable, no runtime LLM, no magic.
- Upstream credentials via env vars derived from the spec's `securitySchemes`
  (V1: API key / bearer token; OAuth flows out of scope)
- Generated `README.md` with run instructions and the tool list

## Verification & error handling

- After `build`: CLI runs `npm install` + `tsc` on the generated project, then a stdio
  smoke test (`tools/list` responds). On compile failure: LLM-assisted repair loop
  (max 2 attempts), then fail loudly with artifacts kept for inspection.
- Live sampling failures → warn and proceed with available samples.
- Invalid spec → clear actionable error.
- Every failure path leaves the manifest / partial output on disk.

## Internal components

Each isolated and independently testable; the manifest is the contract between halves.

| Component | Responsibility |
|---|---|
| `spec-loader` | Parse/dereference OpenAPI; condense for LLM context |
| `sampler` | Load recorded samples; live GET-only capture |
| `analyzer` | Claude call, manifest production, schema validation + retry |
| `manifest` | Manifest JSON Schema + TypeScript types |
| `codegen` | Manifest → generated project files (templates) |
| `verifier` | Compile + smoke-test the generated server |
| `cli` | Commander entry points (`compile`, `build`) |

## Testing

- **Unit tests** per component
- **Golden tests**: fixed hand-written manifest → `build` → compare against checked-in
  expected output. Catches codegen regressions with zero LLM calls.
- **Synthetic fixture**: deliberately bloated fake API (spec + samples) exercising every
  manifest feature
- **Integration (env-gated)**: full pipeline against Jira and GitHub; generated servers
  tested with mocked upstreams

## Out of scope for V1

Hosted compile service & billing; schema-drift watcher; generic `call_api` escape hatch;
Go / REST-proxy output targets; OAuth flows; write-heavy tool safety policies beyond what
the LLM curates.
