# MCPLens

MCPLens is an open-source CLI for auditing whether agents can discover, choose, and
complete MCP tool workflows.

It focuses on tool-surface drift: as MCP servers grow, tools start to overlap,
descriptions get wordier, follow-up flows become unclear, and safety or traceability
signals go missing. MCPLens turns a local `tools/list` export into a practical review
report for maintainers.

The audit runs locally and offline. It does not send tool definitions, logs, prompts, or
reports to a hosted service.

## Quick Start

```sh
npx mcplens-cli audit-mcp --tools-list tools.json --out report.md
```

Requires Node.js 20 or newer.

Common options:

- `--tools-list <path>`: MCP `tools/list` response or a bare tool array. Required.
- `--logs <path>`: JSONL MCP/session events. Optional.
- `--missed-prompts <path>`: JSON or JSONL prompts where a tool should have fired. Optional.
- `--config <path>`: `mcplens.config.json` policy file for profiles and thresholds. Optional.
- `--baseline <path>`: previous audit JSON for regression comparison. Optional.
- `--out <path>`: Markdown report output. Without it, the report prints to stdout.
- `--json <path>`: machine-readable audit report.
- `--capabilities <path>`: machine-readable capability/profile recommendations.
- `--ci --warn-only`: advisory CI summary that exits `0`.

## Export A `tools/list` File

MCPLens accepts either a full MCP JSON-RPC `tools/list` response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "search_docs",
        "description": "Use when: the user needs to find internal docs by keyword, title, owner, or path. Returns matching documents with short snippets and canonical URLs.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": { "type": "string" }
          },
          "required": ["query"]
        }
      }
    ]
  }
}
```

Or a bare array:

```json
[
  {
    "name": "search_docs",
    "description": "Use when: the user needs to find internal docs by keyword, title, owner, or path.",
    "inputSchema": { "type": "object", "properties": {} }
  }
]
```

Most maintainers export this from their MCP server test harness, MCP client logs, or an
inspector session. Keep the export sanitized; tool definitions often reveal internal
system names, URLs, or workflows.

## Example Reports

Checked-in synthetic examples show the kind of review MCPLens produces:

- [`examples/generic-mcp/report.md`](examples/generic-mcp/report.md): short descriptions,
  unsafe destructive tools, contextual confirmation helpers, and catch-all API tools.
- [`examples/browser-mcp/report.md`](examples/browser-mcp/report.md): browser-profile checks
  for mutation contracts, preconditions, and trace artifacts.
- [`examples/large-mcp/report.md`](examples/large-mcp/report.md): a larger surface with
  overlapping search/list/get tools, follow-up helpers, and admin/destructive tools.

Each example includes its `tools-list.json` input so you can rerun the audit.

## What The Audit Catches

MCPLens looks for issues that make agents less likely to pick the right tool or complete a
workflow:

- Missing, vague, overly short, or overly long descriptions.
- Overlapping tools that compete for the same prompt.
- Catch-all tools that hide unclear side effects behind generic inputs.
- Write and destructive tools without safety, confirmation, or review wording.
- Confirm/reject helpers that should be contextual instead of always visible.
- New or regressed findings compared with a baseline report.
- Browser tools that do not say what page/session state they mutate, what must be true
  before calling, or what trace artifact is available afterward.

The score is secondary. Treat the report as a concrete review checklist, not as proof that
tool usage will improve.

## CI

Use warn-only CI by default so drift becomes visible in pull requests without blocking an
urgent deploy:

```sh
npx mcplens-cli audit-mcp \
  --tools-list tools.json \
  --out mcplens-report.md \
  --json mcplens-report.json \
  --capabilities mcplens-capabilities.json \
  --ci \
  --warn-only
```

Strict CI is available when a team explicitly wants findings to fail the job:

```sh
npx mcplens-cli audit-mcp --tools-list tools.json --out report.md --json report.json --ci
```

For policy config, baselines, browser profile details, and a GitHub Actions example, see
[`docs/audit-mcp-ci.md`](docs/audit-mcp-ci.md).

## Privacy

The audit path is local and offline by design:

- No network requests.
- No LLM calls.
- No telemetry.
- Only the files you pass in are read.
- Only the output paths you name are written.

Your tool definitions, logs, prompts, and reports stay on your machine.

## Limitations

- Without logs or missed-prompt files, MCPLens is a static audit of the exposed tool
  surface.
- It cannot prove agents will use tools more often or complete workflows more reliably.
- Scores and findings are heuristics, not ground truth.
- Some findings will be false positives, especially for domain-specific tools with unusual
  naming or safety models.
- The best validation is before/after task completion, tool-call traces, first-tool-call
  latency, failed-call rates, and user workflow outcomes.

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

## Browser MCP Profile

For browser-control MCPs, set `"profile": "browser"` in `mcplens.config.json`:

```json
{
  "profile": "browser"
}
```

Browser action tool descriptions should include:

- `Mutates:` active session, URL/history, DOM/application state, form values, cookies/auth,
  focus/scroll/viewport, or explicitly no page-state mutation.
- `Preconditions:` active session, loaded page, prior observe call, known target
  element/selector, authenticated state, user gesture, or page readiness.
- `Available afterward:` session id, final URL, replay URL, screenshot, action result,
  extracted payload, console logs, network logs, or another trace artifact.

## OpenAPI To MCP

MCPLens also includes an advanced flow for turning an OpenAPI spec into a standalone
TypeScript MCP server:

```sh
npx mcplens-cli compile \
  --spec examples/stripe/openapi.json \
  --samples examples/stripe/samples \
  --impact-report stripe-impact.json \
  --out agentify.manifest.json \
  --offline

npx mcplens-cli build --manifest agentify.manifest.json --out ./stripe-mcp
```

`compile` writes an editable manifest describing tools, upstream requests, response maps,
and hidden endpoints. With `ANTHROPIC_API_KEY` set, it can use an LLM once at build time
for better curation. With `--offline`, it uses deterministic heuristics.

`build` generates a standalone TypeScript MCP server, installs dependencies, type-checks
the project, and smoke-tests MCP `tools/list` over stdio. The generated server makes no LLM
calls at runtime.

See [`GUIDE.md`](GUIDE.md) for the full OpenAPI-to-MCP walkthrough and
[`IMPACT.md`](IMPACT.md) for token and tool-surface reductions on representative API
fixtures.

## Development

From a repo checkout:

```sh
npm ci
npm run build
npm test
npm run smoke:pack
```
