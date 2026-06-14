# agentify — Impact Report

How much does compiling a bloated REST API into a lean, agent-optimized MCP server
actually save? This report runs `agentify` against five public API fixtures modeled on
the documented response shapes of widely-used, famously bloated APIs, plus the built-in
Trackly fixture as a baseline, and measures two dimensions of impact:

1. **Tool-surface curation** — how many raw endpoints collapse into agent-useful tools,
   and how many UI/admin/webhook endpoints get hidden.
2. **Response token savings** — how much smaller each response payload becomes after the
   generated `responseMap` strips UI cruft, measured on a recorded sample payload.

All numbers below are from the **offline deterministic heuristic** (`--offline`, no
`ANTHROPIC_API_KEY`), so they are fully reproducible. The LLM curation path generally does
better on *field selection* (see [Caveats](#caveats)).

## Headline numbers

| API | Endpoints | Tools | Hidden | Raw bytes | Lean bytes | Raw tokens | Lean tokens | **Saved** |
|-----|----------:|------:|-------:|----------:|-----------:|-----------:|------------:|----------:|
| **GitHub** (issue) | 11 | 7 | 4 | 7,784 | 1,296 | 1,946 | 324 | **83%** |
| **Notion** (page) | 12 | 9 | 3 | 3,138 | 457 | 785 | 115 | **85%** |
| **Slack** (users.info) | 11 | 7 | 4 | 2,517 | 417 | 630 | 105 | **83%** |
| **Google Calendar** (event) | 10 | 10 | 0 | 3,669 | 888 | 918 | 222 | **76%** |
| **Stripe** (customer) | 12 | 8 | 4 | 1,945 | 394 | 487 | 99 | **80%** |
| **Trackly** (issue, built-in) | 4 | 2 | 2 | 791 | 445 | 198 | 112 | 43% |
| **Five public API fixtures** | **56** | **41** | **15** | 19,053 | 3,451 | 4,766 | 865 | **82%** |
| **Total including Trackly** | **60** | **43** | **17** | 19,844 | 3,896 | 4,964 | 977 | **~80%** |

**Two-line summary:**

- **Token savings on public-API-shaped payloads: 76–85%** per response. Trackly is the
  outlier at 43% because its sample is tiny, ~200 tokens, so there is less cruft to strip.
- **Tool surface shrinks 27% on the five public API fixtures**: 56 raw operations → 41
  tools, with **15 endpoints hidden** (avatars, webhooks, admin, oauth, file uploads,
  audit logs) so the agent never sees them.

Why this matters: a coding/automation agent pays the response-token cost on **every single
tool call**, and pays the tool-list cost on **every turn**. An 80% cut to response size
compounds across a conversation, and a leaner tool list reduces tool-selection errors.
The example manifests also have semantic smoke tests that assert core fields like issue
title/state/body, event start/end, page title/status, user email, and customer email survive
the compression.

## Per-API detail

### GitHub — `GET /issues/{issue_number}` → 83%
A single GitHub issue is ~7.8 KB. Each embedded `user` object carries 18 fields (17 of them
URLs: `followers_url`, `gists_url`, `received_events_url`, …), repeated for `assignee`,
`assignees`, and the `milestone.creator`. Plus `reactions` URL block, `labels[].node_id`,
`_url` fields on the issue itself. The lean response is **1,296 bytes** and preserves the
issue number, title, state, and full body instead of truncating the body to a heading.
Hidden: webhook creation, label-avatar, audit-log, admin restore.

### Notion — `GET /v1/pages/{page_id}` → 85%
Notion's property model is the most verbose tested: every rich-text run carries an
`annotations` block (`bold`, `italic`, `strikethrough`, `underline`, `code`, `color`), plus
`created_by`/`last_edited_by` user objects, `cover`, `icon`, and per-property type wrappers.
3.1 KB → 457 bytes. Hidden: oauth token, file uploads, webhooks.

### Slack — `GET /users.info` → 83%
The classic avatar-bloat case: the `profile` object ships **8 image sizes**
(`image_24` … `image_1024`, `image_original`) plus `avatar_hash`. 2.5 KB → 417 bytes.
Hidden: file upload, admin.users.list, oauth, users.setPhoto.

### Google Calendar — `GET /events/{eventId}` → 76%
`conferenceData` (entry points, signature, icon URIs), per-attendee status objects,
`reminders.overrides`, `extendedProperties`, and a dozen `guestsCan*` flags. 3.7 KB → 888
bytes. **Note: 0 endpoints hidden** — see caveat below.

### Stripe — `GET /v1/customers/{customer}` → 80%
Nested deprecated list objects (`sources`, `subscriptions`, `tax_ids` each with
`object`/`data`/`has_more`/`total_count`/`url`), `invoice_settings`, and many null internal
fields. 1.9 KB → 394 bytes. Hidden: webhook endpoints, oauth, admin account close.

### Trackly — built-in fixture → 43%
The repo's existing 4-endpoint fixture. Its sample is small (~200 tokens), so the absolute
win is modest; included as the baseline. Note the *hand-curated* manifest in
`tests/fixtures/trackly.manifest.json` reaches **72%** on the same sample — the gap between
43% and 72% is the gap between the offline heuristic and good curation.

## Caveats

These numbers are honest, but read them with two qualifications:

1. **Offline field *selection* is still heuristic.** The heuristic now favors top-level
   semantic fields over nested metadata URLs and the tests assert the public examples keep
   their core agent-useful fields. It is still not a replacement for human or LLM curation:
   it may keep a useful-but-not-ideal field, miss domain-specific meaning, or leave arrays
   in a mechanically correct but less polished shape. The **LLM curation path** (set
   `ANTHROPIC_API_KEY`) is designed to pick semantically correct fields; the hand-curated
   Trackly manifest (`id`, `key`, `summary`, `status`, `description`, `assignee_name`,
   `updated`) demonstrates what good selection looks like. **Treat the token percentages as
   a compression baseline, and the LLM/curated manifest as the path to a lean payload that's
   also best-fit for agents.**

2. **Offline hiding is keyword-based.** Endpoints are hidden only when their path/summary
   matches known patterns (`avatar`, `webhook`, `admin`, `oauth`, `audit`, `upload`, …).
   Google Calendar hid **0** endpoints because `events/watch`, `/acl`, and `channels/stop`
   don't contain those keywords — even though `/acl` (permissions) and `watch` (a webhook
   channel) are exactly the kind of thing a human or the LLM would hide. Real curation closes
   this gap.

## Reproducing

Each example lives under [`examples/`](examples/) with its `openapi.json`, a recorded
`samples/` payload, and the generated `impact-report.json` + `agentify.manifest.json`.
Regenerate any of them:

```sh
npm run cli -- compile \
  --spec examples/github/openapi.json \
  --samples examples/github/samples \
  --impact-report examples/github/impact-report.json \
  --out examples/github/agentify.manifest.json \
  --offline
```

Drop `--offline` (with `ANTHROPIC_API_KEY` set) to use real LLM curation, which should
improve field selection and hiding on every API above.

## Public API sources

The five benchmark fixtures are intentionally small so they stay reviewable in this repo,
but their endpoints and sample payload shapes are modeled on public documentation:

- GitHub Issues REST API and GitHub's public OpenAPI description:
  https://docs.github.com/rest/issues/issues and
  https://docs.github.com/en/rest/about-the-rest-api/about-the-openapi-description-for-the-rest-api
- Stripe Customer API and Stripe's public OpenAPI repository:
  https://docs.stripe.com/api/customers/retrieve and https://github.com/stripe/openapi
- Slack `users.info` Web API method:
  https://docs.slack.dev/reference/methods/users.info
- Google Calendar Events API:
  https://developers.google.com/workspace/calendar/api/v3/reference/events
- Notion Retrieve Page API and Page object reference:
  https://developers.notion.com/reference/retrieve-a-page and
  https://developers.notion.com/reference/page

> The example specs and sample payloads are representative fixtures modeled on the public,
> documented response shapes of these APIs, not captured production data.
