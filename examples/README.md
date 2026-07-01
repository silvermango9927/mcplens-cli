# MCPLens Examples

This directory contains two kinds of examples:

- Synthetic MCP `tools/list` exports and generated audit reports for `audit-mcp`.
- Real-world-shaped OpenAPI fixtures used by the OpenAPI-to-MCP generator and impact
  report.

## Audit Report Examples

These examples are synthetic and safe to inspect. They are meant to show the report shape
without requiring access to a private MCP server.

| Example | Shows | Rerun |
|---------|-------|-------|
| [`generic-mcp/`](generic-mcp/) | Short descriptions, destructive tools, contextual confirmation helpers, catch-all tools | `npx mcplens-cli audit-mcp --tools-list examples/generic-mcp/tools-list.json --out examples/generic-mcp/report.md --offline` |
| [`browser-mcp/`](browser-mcp/) | Browser profile checks for mutation, preconditions, and trace artifacts | `npx mcplens-cli audit-mcp --tools-list examples/browser-mcp/tools-list.json --config examples/browser-mcp/mcplens.config.json --out examples/browser-mcp/report.md --offline` |
| [`large-mcp/`](large-mcp/) | Larger tool surface with overlap, default/admin/contextual exposure pressure | `npx mcplens-cli audit-mcp --tools-list examples/large-mcp/tools-list.json --out examples/large-mcp/report.md --offline` |

## OpenAPI Fixtures

Real-world-shaped API fixtures used to measure MCPLens impact. See the aggregated results
in [`../IMPACT.md`](../IMPACT.md).

Each directory contains:

- `openapi.json` — an OpenAPI 3.0 spec modeled on a real API's endpoints
- `samples/*.json` — a recorded sample response payload (the `{ "endpoint", "response" }`
  wrapper format) for the main GET-by-id endpoint
- `impact-report.json` — generated: tool counts, hidden-endpoint counts, token savings
- `agentify.manifest.json` — generated: the curated manifest

| Example | Modeled on | Main sample endpoint |
|---------|-----------|----------------------|
| `github/` | GitHub REST API (Issues) | `GET /repos/{owner}/{repo}/issues/{issue_number}` |
| `stripe/` | Stripe API (Customers) | `GET /v1/customers/{customer}` |
| `slack/` | Slack Web API (users.info) | `GET /users.info` |
| `google-calendar/` | Google Calendar API (Events) | `GET /calendars/{calendarId}/events/{eventId}` |
| `notion/` | Notion API (Pages) | `GET /v1/pages/{page_id}` |

The specs and sample payloads are representative fixtures modeled on the public, documented
response shapes of these APIs — not captured production data.

Source docs used for the fixtures:

- GitHub Issues REST API: https://docs.github.com/rest/issues/issues
- Stripe Customer API: https://docs.stripe.com/api/customers/retrieve
- Slack `users.info`: https://docs.slack.dev/reference/methods/users.info
- Google Calendar Events API: https://developers.google.com/workspace/calendar/api/v3/reference/events
- Notion Retrieve Page: https://developers.notion.com/reference/retrieve-a-page

## Regenerate all reports

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

Drop `--offline` with `ANTHROPIC_API_KEY` set to use LLM curation for the OpenAPI fixtures
(better field selection and endpoint hiding).
