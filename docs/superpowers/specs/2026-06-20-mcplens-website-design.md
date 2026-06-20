# mcplens.tech — landing site design

**Date:** 2026-06-20
**Status:** Approved, building

## Goal

A single professional landing page to link to instead of pointing people at the
GitHub repo, npm, and the GUIDE/IMPACT docs separately. Hosted on Vercel, custom
domain `mcplens.tech` (GitHub Student free domain, not yet redeemed).

## Decisions

- **Shape:** single scrollable landing page (not multi-page docs).
- **Lives in:** `website/` subfolder of the `mcplens-cli` repo (not a separate repo).
  Source sits next to the project; npm package unaffected (controlled by `files`).
- **Tech:** plain static HTML + CSS, zero build step. Framework migration deferred to
  a later "scale" phase.
- **Design direction:** Editorial Light — white bg, bold sans headline, single indigo
  accent, generous whitespace, docs-like. Light mode only for v1.

## Page structure (top → bottom)

1. **Header** — `mcplens` wordmark; GitHub + npm links. Sticky, minimal.
2. **Hero** — headline, subhead, copy-paste install command (copy button), two CTAs
   (primary → GitHub, secondary → Guide).
3. **Stat band** — `~80%` fewer response tokens · `27%` smaller tool surface · `100%`
   local & offline. (Numbers from IMPACT.md.)
4. **What it does** — two feature blocks: `audit-mcp` (tool-activation audit) and
   `compile`/`build` (OpenAPI → lean MCP server).
5. **Privacy strip** — local & offline by design: no network, no LLM calls, no telemetry.
6. **Quick start** — `npx` commands, Node 20+ note.
7. **Footer** — GitHub · npm · Guide · Impact · MIT.

## Copy

- **Headline:** Make MCP servers agents can actually use.
- **Subhead:** mcplens audits whether agents can discover your tools — and compiles
  bloated REST APIs into lean MCP servers. Runs locally, no telemetry.

## Visual system

- Colors: bg `#ffffff`, text `#0f172a`, muted `#64748b`, accent indigo `#6366f1`,
  borders `#e2e8f0`, surfaces `#f8fafc`/`#f1f5f9`.
- Type: system font stack (instant, no Google Fonts network call — consistent with the
  privacy story). Monospace stack for code.
- ~1080px max width, 8–12px radii, subtle shadows, fully responsive.

## Files (`website/`, no build)

- `index.html`, `styles.css`
- `favicon.svg` (lens/aperture mark)
- `og.png` + OpenGraph/Twitter meta for link previews
- `robots.txt`, `sitemap.xml`
- `vercel.json` (clean URLs + cache headers)
- `README.md` (deploy notes)

## Deploy

1. Build `website/`, commit, push (PR to `main`).
2. Vercel → New Project → import `mcplens-cli` → Root Directory = `website`,
   framework = Other/static → Deploy.
3. After `mcplens.tech` is redeemed: add under Vercel → Domains, point DNS per Vercel's
   records. Update canonical/OG URLs to the final domain.
