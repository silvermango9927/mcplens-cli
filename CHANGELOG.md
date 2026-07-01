# Changelog

All notable changes to MCPLens will be documented in this file.

## 0.1.2 - 2026-07-01

### Added

- Local/offline `audit-mcp` command for MCP `tools/list` exports, usage logs, missed prompts, baseline comparison, CI summaries, Markdown reports, JSON reports, and capability recommendations.
- Browser MCP audit profile for browser/session/page action tools, including checks for mutation contracts, preconditions, and trace artifacts.
- OpenAPI-to-MCP `compile` and `build` flow for generating lean TypeScript MCP servers from curated manifests.
- Example API fixtures and impact reports for GitHub, Stripe, Slack, Google Calendar, and Notion.
- Pack smoke test that installs the npm tarball, verifies both `mcplens` and legacy `agentify` binaries, and runs an installed `audit-mcp` command.

### Changed

- Published package contents now include the guide, impact report, CI documentation, examples, changelog, and license alongside the built CLI.

