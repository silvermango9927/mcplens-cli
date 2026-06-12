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

export function upstreamTemplate(manifest: Manifest): string {
  return `const BASE_URL = process.env.AGENTIFY_BASE_URL ?? ${JSON.stringify(manifest.api.baseUrl)}
const AUTH = ${JSON.stringify(manifest.api.auth, null, 2)} as const

type ParamDef = { name: string; in: 'path' | 'query' | 'body'; type: string; required?: boolean; description?: string }

export async function requestJson(
  method: string,
  pathTemplate: string,
  args: Record<string, unknown>,
  params: readonly ParamDef[]
): Promise<unknown> {
  const path = pathTemplate.replace(/\\{([^}]+)\\}/g, (_, name: string) => encodeURIComponent(stringArg(args, name)))
  const url = new URL(path, BASE_URL.endsWith('/') ? BASE_URL : \`\${BASE_URL}/\`)
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

  const headers: Record<string, string> = { Accept: 'application/json', ...authHeaders() }
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

function authHeaders(): Record<string, string> {
${authHeaderSource(manifest.api.auth)}
}
`
}

function authHeaderSource(auth: ManifestAuth): string {
  if (auth.type === 'bearer') {
    return `  const token = process.env[${JSON.stringify(auth.envVar)}]
  return token ? { Authorization: \`Bearer \${token}\` } : {}`
  }
  if (auth.type === 'header') {
    return `  const token = process.env[${JSON.stringify(auth.envVar)}]
  return token ? { [${JSON.stringify(auth.header)}]: token } : {}`
  }
  if (auth.type === 'basic') {
    return `  const user = process.env[${JSON.stringify(auth.userEnvVar)}]
  const pass = process.env[${JSON.stringify(auth.passEnvVar)}]
  return user && pass ? { Authorization: \`Basic \${Buffer.from(\`\${user}:\${pass}\`).toString('base64')}\` } : {}`
  }
  return '  return {}'
}

export function indexTemplate(manifest: Manifest): string {
  const imports = manifest.tools
    .map((tool) => `import { ${registerFunctionName(tool.name)} } from './tools/${tool.name}.js'`)
    .join('\n')
  const registrations = manifest.tools.map((tool) => `${registerFunctionName(tool.name)}(server)`).join('\n  ')
  return `import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
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

async function startHttp(): Promise<void> {
  const app = createMcpExpressApp()
  const transports: Record<string, StreamableHTTPServerTransport> = {}
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
  const port = Number(process.env.PORT ?? 3000)
  app.listen(port, (error?: Error) => {
    if (error) {
      console.error(error)
      process.exit(1)
    }
    console.error(\`MCP Streamable HTTP listening on http://localhost:\${port}/mcp\`)
  })
}

if (process.env.MCP_TRANSPORT === 'http') startHttp()
else startStdio()
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

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'agentified-api'
}
