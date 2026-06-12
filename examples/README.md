# agentify examples

Real-world-shaped API fixtures used to measure agentify's impact. See the aggregated
results in [`../IMPACT.md`](../IMPACT.md).

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
  npm run cli -- compile \
    --spec "examples/$api/openapi.json" \
    --samples "examples/$api/samples" \
    --impact-report "examples/$api/impact-report.json" \
    --out "examples/$api/agentify.manifest.json" \
    --offline
done
```

Drop `--offline` with `ANTHROPIC_API_KEY` set to use LLM curation (better field selection
and endpoint hiding).
