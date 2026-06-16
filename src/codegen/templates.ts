import type { Manifest, ManifestAuth } from '../manifest/schema.js'
import type { ManifestTool } from '../manifest/schema.js'
import { registerFunctionName } from './tool-file.js'

export function packageJsonTemplate(manifest: Manifest): string {
  const name = `${slug(manifest.api.name)}-mcp`
  return JSON.stringify(
    {
      name,
      version: '0.1.0',
      type: 'module',
      private: true,
      scripts: {
        build: 'tsc',
        start: 'node dist/index.js',
        dev: 'tsx src/index.ts'
      },
      dependencies: {
        '@modelcontextprotocol/sdk': '^1.12.0',
        zod: '^3.24.0'
      },
      devDependencies: {
        '@types/node': '^22.0.0',
        tsx: '^4.19.0',
        typescript: '^5.6.0'
      }
    },
    null,
    2
  )
}

export function tsconfigTemplate(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        outDir: 'dist',
        rootDir: 'src',
        skipLibCheck: true
      },
      include: ['src']
    },
    null,
    2
  )
}

export function envExampleTemplate(manifest: Manifest): string {
  const lines = [
    'MCP_TRANSPORT=http',
    'HOST=0.0.0.0',
    'PORT=3000',
    'MCP_HTTP_TOKEN=change-me',
    `AGENTIFY_BASE_URL=${manifest.api.baseUrl}`,
    ...authEnvVars(manifest.api.auth).map((name) => `${name}=`)
  ]
  return lines.join('\n')
}

export function dockerfileTemplate(): string {
  return `FROM node:20-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
`
}

export function dockerComposeTemplate(manifest: Manifest): string {
  const environment = [
    '      MCP_TRANSPORT: ${MCP_TRANSPORT:-http}',
    '      HOST: ${HOST:-0.0.0.0}',
    '      PORT: ${PORT:-3000}',
    '      MCP_HTTP_TOKEN: ${MCP_HTTP_TOKEN:?set MCP_HTTP_TOKEN in .env}',
    '      AGENTIFY_BASE_URL: ${AGENTIFY_BASE_URL:?set AGENTIFY_BASE_URL in .env}',
    ...authEnvVars(manifest.api.auth).map((name) => `      ${name}: \${${name}:?set ${name} in .env}`)
  ].join('\n')

  return `services:
  mcp:
    build: .
    env_file:
      - .env
    environment:
${environment}
    ports:
      - "3000:3000"
`
}

export function configTemplate(manifest: Manifest): string {
  return `type McpTransport = 'stdio' | 'http'

type AuthConfig =
  | { type: 'bearer'; envVar: string }
  | { type: 'header'; header: string; envVar: string }
  | { type: 'basic'; userEnvVar: string; passEnvVar: string }
  | { type: 'none' }

export type UpstreamAuth =
  | { type: 'bearer'; envVar: string; token: string }
  | { type: 'header'; header: string; envVar: string; value: string }
  | { type: 'basic'; userEnvVar: string; passEnvVar: string; user: string; pass: string }
  | { type: 'none' }

export type RuntimeConfig = {
  transport: McpTransport
  host: string
  port: number
  mcpHttpToken?: string
  agentifyBaseUrl: string
  upstreamAuth: UpstreamAuth
}

const DEFAULT_BASE_URL = ${JSON.stringify(manifest.api.baseUrl)}
const AUTH: AuthConfig = ${JSON.stringify(manifest.api.auth, null, 2)}

let cachedConfig: RuntimeConfig | undefined

export function getConfig(): RuntimeConfig {
  cachedConfig ??= loadConfig()
  return cachedConfig
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const errors: string[] = []
  const transport = parseTransport(env.MCP_TRANSPORT, errors)
  const host = parseHost(env.HOST)
  const port = parsePort(env.PORT, errors)
  const mcpHttpToken = loadHttpToken(env, transport, errors)
  const agentifyBaseUrl = parseUrl(env.AGENTIFY_BASE_URL ?? DEFAULT_BASE_URL, 'AGENTIFY_BASE_URL', errors)
  const upstreamAuth = loadUpstreamAuth(env, errors)

  if (errors.length > 0) {
    throw new Error(\`Invalid runtime configuration: \${errors.join('; ')}\`)
  }

  return { transport, host, port, mcpHttpToken, agentifyBaseUrl, upstreamAuth }
}

function parseTransport(value: string | undefined, errors: string[]): McpTransport {
  if (value == null || value === '') return 'stdio'
  if (value === 'stdio' || value === 'http') return value
  errors.push('MCP_TRANSPORT must be "stdio" or "http"')
  return 'stdio'
}

function parseHost(value: string | undefined): string {
  return value && value.trim() ? value.trim() : '127.0.0.1'
}

function parsePort(value: string | undefined, errors: string[]): number {
  if (value == null || value === '') return 3000
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('PORT must be an integer from 1 to 65535')
    return 3000
  }
  return port
}

function loadHttpToken(env: NodeJS.ProcessEnv, transport: McpTransport, errors: string[]): string | undefined {
  if (transport !== 'http') return undefined
  return requireEnv(env, 'MCP_HTTP_TOKEN', errors)
}

function parseUrl(value: string, envVar: string, errors: string[]): string {
  try {
    return new URL(value).toString()
  } catch {
    errors.push(\`\${envVar} must be a valid URL\`)
    return DEFAULT_BASE_URL
  }
}

function loadUpstreamAuth(env: NodeJS.ProcessEnv, errors: string[]): UpstreamAuth {
  if (AUTH.type === 'bearer') {
    return { type: 'bearer', envVar: AUTH.envVar, token: requireEnv(env, AUTH.envVar, errors) }
  }
  if (AUTH.type === 'header') {
    return { type: 'header', header: AUTH.header, envVar: AUTH.envVar, value: requireEnv(env, AUTH.envVar, errors) }
  }
  if (AUTH.type === 'basic') {
    return {
      type: 'basic',
      userEnvVar: AUTH.userEnvVar,
      passEnvVar: AUTH.passEnvVar,
      user: requireEnv(env, AUTH.userEnvVar, errors),
      pass: requireEnv(env, AUTH.passEnvVar, errors)
    }
  }
  return { type: 'none' }
}

function requireEnv(env: NodeJS.ProcessEnv, name: string, errors: string[]): string {
  const value = env[name]
  if (value && value.trim()) return value
  errors.push(\`missing required env var \${name}\`)
  return ''
}
`
}

export function upstreamTemplate(_manifest: Manifest): string {
  return `import { getConfig, type RuntimeConfig } from './config.js'

type ParamDef = { name: string; in: 'path' | 'query' | 'body'; type: string; required?: boolean; description?: string }

export async function requestJson(
  method: string,
  pathTemplate: string,
  args: Record<string, unknown>,
  params: readonly ParamDef[]
): Promise<unknown> {
  const config = getConfig()
  const path = pathTemplate.replace(/\\{([^}]+)\\}/g, (_, name: string) => encodeURIComponent(stringArg(args, name)))
  const url = new URL(path, config.agentifyBaseUrl.endsWith('/') ? config.agentifyBaseUrl : \`\${config.agentifyBaseUrl}/\`)
  const body: Record<string, unknown> = {}

  for (const param of params) {
    const value = args[param.name]
    if (value == null) continue
    if (param.in === 'query') {
      if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(param.name, String(item)))
      else url.searchParams.set(param.name, String(value))
    }
    if (param.in === 'body') body[param.name] = value
  }

  const headers: Record<string, string> = { Accept: 'application/json', ...authHeaders(config) }
  const hasBody = Object.keys(body).length > 0
  if (hasBody) headers['Content-Type'] = 'application/json'
  const response = await fetch(url, { method, headers, body: hasBody ? JSON.stringify(body) : undefined })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(\`Upstream \${method} \${url.pathname} failed with \${response.status}: \${text.slice(0, 500)}\`)
  }
  if (response.status === 204) return null
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

function stringArg(args: Record<string, unknown>, name: string): string {
  const value = args[name]
  if (value == null) throw new Error(\`Missing required path parameter \${name}\`)
  return String(value)
}

function authHeaders(config: RuntimeConfig): Record<string, string> {
  if (config.upstreamAuth.type === 'bearer') {
    return { Authorization: \`Bearer \${config.upstreamAuth.token}\` }
  }
  if (config.upstreamAuth.type === 'header') {
    return { [config.upstreamAuth.header]: config.upstreamAuth.value }
  }
  if (config.upstreamAuth.type === 'basic') {
    return { Authorization: \`Basic \${Buffer.from(\`\${config.upstreamAuth.user}:\${config.upstreamAuth.pass}\`).toString('base64')}\` }
  }
  return {}
}
`
}

export function indexTemplate(manifest: Manifest): string {
  const imports = manifest.tools
    .map((tool) => `import { ${registerFunctionName(tool.name)} } from './tools/${tool.name}.js'`)
    .join('\n')
  const registrations = manifest.tools.map((tool) => `${registerFunctionName(tool.name)}(server)`).join('\n  ')
  return `import { randomUUID, timingSafeEqual } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { getConfig, type RuntimeConfig } from './lib/config.js'
${imports}

function createServer(): McpServer {
  const server = new McpServer({ name: ${JSON.stringify(`${manifest.api.name} MCP`)}, version: '0.1.0' })
  ${registrations}
  return server
}

async function startStdio(): Promise<void> {
  const server = createServer()
  await server.connect(new StdioServerTransport())
}

async function startHttp(config: RuntimeConfig): Promise<void> {
  if (!config.mcpHttpToken) throw new Error('MCP_HTTP_TOKEN is required when MCP_TRANSPORT=http')
  const app = createMcpExpressApp()
  const transports: Record<string, StreamableHTTPServerTransport> = {}
  app.get('/healthz', (_req: any, res: any) => res.status(200).json({ ok: true }))
  app.get('/readyz', (_req: any, res: any) => res.status(200).json({ ok: true }))
  app.use('/mcp', (req: any, res: any, next: any) => {
    if (hasValidBearerAuth(req, config.mcpHttpToken!)) {
      next()
      return
    }
    res
      .status(401)
      .set('WWW-Authenticate', 'Bearer')
      .json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: requestId(req) })
  })

  app.post('/mcp', async (req: any, res: any) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      let transport = sessionId ? transports[sessionId] : undefined
      if (!transport && !sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (id) => {
            if (transport) transports[id] = transport
          }
        })
        await createServer().connect(transport)
      }
      if (!transport) {
        res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: no valid MCP session' }, id: null })
        return
      }
      await transport.handleRequest(req, res, req.body)
    } catch (error) {
      console.error(error)
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null })
    }
  })
  app.get('/mcp', (_req: any, res: any) => res.status(405).set('Allow', 'POST').send('Method Not Allowed'))
  app.listen(config.port, config.host, (error?: Error) => {
    if (error) {
      console.error(error)
      process.exit(1)
    }
    const displayHost = config.host === '0.0.0.0' ? 'localhost' : config.host
    console.error(\`MCP Streamable HTTP listening on http://\${displayHost}:\${config.port}/mcp\`)
  })
}

function hasValidBearerAuth(req: any, token: string): boolean {
  const authorization = req.headers.authorization
  if (typeof authorization !== 'string') return false
  const prefix = 'Bearer '
  if (authorization.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) return false
  const supplied = authorization.slice(prefix.length)
  return constantTimeEqual(supplied, token)
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function requestId(req: any): unknown {
  return req.body && typeof req.body === 'object' && 'id' in req.body ? req.body.id : null
}

try {
  const config = getConfig()
  if (config.transport === 'http') await startHttp(config)
  else await startStdio()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
`
}

export function readmeTemplate(manifest: Manifest): string {
  const auth = authInstructions(manifest.api.auth)
  return `# ${manifest.api.name} MCP

Generated by agentify.

## Run

\`\`\`sh
npm install
npm run build
${auth}
npm start
\`\`\`

Stdio is the default transport. For Streamable HTTP:

\`\`\`sh
MCP_TRANSPORT=http PORT=3000 npm start
\`\`\`

## Tools

${manifest.tools.map(toolSummary).join('\n')}
`
}

function toolSummary(tool: ManifestTool): string {
  const endpoints = tool.requests.map((r) => `${r.method} ${r.path}`).join(', ')
  return `- \`${tool.name}\`: ${tool.description} (${endpoints})`
}

function authInstructions(auth: ManifestAuth): string {
  if (auth.type === 'bearer') return `export ${auth.envVar}=...`
  if (auth.type === 'header') return `export ${auth.envVar}=...`
  if (auth.type === 'basic') return `export ${auth.userEnvVar}=...\nexport ${auth.passEnvVar}=...`
  return '# No upstream auth env vars were inferred'
}

function authEnvVars(auth: ManifestAuth): string[] {
  if (auth.type === 'bearer' || auth.type === 'header') return [auth.envVar]
  if (auth.type === 'basic') return [auth.userEnvVar, auth.passEnvVar]
  return []
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'agentified-api'
}
