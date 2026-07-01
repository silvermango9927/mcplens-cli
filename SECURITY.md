# Security Policy

## Supported Versions

Security fixes are accepted for the latest published version of MCPLens.

## Reporting a Vulnerability

Please report security issues privately through GitHub Security Advisories for this
repository. If advisories are unavailable, open a minimal public issue that says you need a
private security contact, but do not include exploit details or sensitive data.

Useful details include:

- Affected version or commit.
- Reproduction steps.
- Impact and affected command path.
- Whether any secrets, credentials, local files, or generated MCP servers are exposed.

## Security Expectations

- `audit-mcp` must remain local and offline unless a future feature is explicitly
  documented as opt-in network behavior.
- Do not include real API tokens, production payloads, private tool definitions, or
  customer data in examples, tests, screenshots, or issue reports.
- Generated MCP servers should keep credentials in environment variables and `.env`
  files that are excluded from git.

