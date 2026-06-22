# MCP Tool Surface CI

`audit-mcp` can run as a local CI regression check for MCP `tools/list` exports. The
recommended CI setup is advisory: warn loudly, upload the Markdown/JSON artifacts, and
let urgent deploys continue. Strict/failing CI remains available when a team explicitly
wants tool-surface findings to block a job.

## Command

```sh
npx mcplens-cli audit-mcp \
  --tools-list tools.json \
  --config mcplens.config.json \
  --baseline mcplens-baseline.json \
  --out mcplens-report.md \
  --json mcplens-report.json \
  --capabilities capabilities.json \
  --ci \
  --warn-only
```

With `--ci --warn-only`, the command prints CI warnings but exits `0` even when the
effective policy produces `fail` findings. It always writes the requested report
artifacts first.

For strict CI, omit `--warn-only`:

```sh
npx mcplens-cli audit-mcp \
  --tools-list tools.json \
  --config mcplens.config.json \
  --baseline mcplens-baseline.json \
  --out mcplens-report.md \
  --json mcplens-report.json \
  --ci
```

Strict mode exits `1` when the effective policy produces one or more `fail` findings.

## Config

```json
{
  "profile": "production",
  "descriptionStyle": "concise",
  "failOn": ["missing_description", "unsafe_destructive_tool", "score_regression"],
  "thresholds": {
    "minAverageScore": 75,
    "maxScoreDrop": 5,
    "minToolScore": 50
  },
  "rules": {
    "requireDescriptions": true,
    "requireUseWhen": false,
    "requireSafetyForDestructive": true,
    "requireSafetyForWrite": false,
    "flagCatchAllTools": true,
    "flagToolOverlap": "warn",
    "allowReadOnlyWithoutSafety": true
  }
}
```

Profiles:

- `production`: for MCP servers that can affect user data, external systems, files,
  accounts, or production workflows.
- `local-dev`: for local developer tools, debug MCPs, scaffolding, local IDE/test/dev
  servers. Catch-all tools are still flagged.
- `read-only`: for pure retrieval, search, and lookup MCPs.
- `concise`: for maintainers who want minimal context footprint and no blanket verbose
  description template.

Stable finding IDs include `missing_description`, `unsafe_destructive_tool`,
`unsafe_write_tool`, `tool_overlap`, `catch_all_tool`, `score_regression`,
`new_tool_without_description`, and `new_destructive_tool_without_safety`.

## Baselines

Pass a previous `--json` audit output as `--baseline`. The report compares average score,
per-tool score changes, new and removed tools, new missing descriptions, new unsafe
destructive tools, and threshold violations.

## GitHub Actions

```yaml
name: MCP Tool Surface Audit

on:
  pull_request:
    branches: [main]

jobs:
  audit-mcp:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Export MCP tools/list
        run: |
          npm ci
          npm run export:tools-list > tools.json

      - name: Run mcplens audit
        run: |
          npx mcplens-cli audit-mcp \
            --tools-list tools.json \
            --config mcplens.config.json \
            --baseline mcplens-baseline.json \
            --out mcplens-report.md \
            --json mcplens-report.json \
            --ci \
            --warn-only

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mcplens-report
          path: |
            mcplens-report.md
            mcplens-report.json
```
