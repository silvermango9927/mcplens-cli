# Contributing

Thanks for helping improve MCPLens. This project is still early, so small, focused changes
are easiest to review.

## Development Setup

```sh
npm ci
npm run build
npm test
npm run smoke:pack
```

MCPLens requires Node.js 20 or newer.

## Pull Requests

- Keep changes focused on one behavior or documentation update.
- Add or update tests when behavior changes.
- Run `npm test` before opening a pull request.
- Run `npm run smoke:pack` when package contents, CLI entry points, or release metadata change.
- Avoid committing generated `dist/`, `node_modules/`, local reports, secrets, or `.env` files.

## Local Audit Behavior

The `audit-mcp` command is local and offline by design. If you add audit features, preserve
that contract unless the change explicitly introduces an opt-in network path and documents
it clearly.

## Reporting Issues

Please include the command you ran, your Node.js version, sanitized input snippets when
possible, and the actual output or stack trace.

