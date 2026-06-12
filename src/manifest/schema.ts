import { z } from 'zod'

export const TRANSFORM_NAMES = ['stripHtml', 'adfToPlainText', 'toString', 'count', 'firstLine'] as const
export type TransformName = (typeof TRANSFORM_NAMES)[number]

export const ResponseMapEntrySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  source: z.string().min(1).default('main'),
  transform: z.enum(TRANSFORM_NAMES).optional(),
  reason: z.string().default('')
})

export const ToolParamSchema = z.object({
  name: z.string().min(1),
  in: z.enum(['path', 'query', 'body']),
  type: z.enum(['string', 'number', 'boolean', 'string[]']),
  required: z.boolean().default(false),
  description: z.string().default('')
})

export const ToolRequestSchema = z.object({
  key: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1)
})

export const ToolSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_]*$/),
    description: z.string().min(1),
    params: z.array(ToolParamSchema).default([]),
    requests: z.array(ToolRequestSchema).min(1),
    responseMap: z.array(ResponseMapEntrySchema).min(1)
  })
  .superRefine((tool, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message })
    const keys = tool.requests.map((r) => r.key)
    if (tool.requests.filter((r) => r.key === 'main').length !== 1) issue('exactly one request must have key "main"')
    if (new Set(keys).size !== keys.length) issue('request keys must be unique')
    if (tool.requests.length > 1 && tool.params.some((p) => p.name === 'include'))
      issue('"include" is a reserved param name on multi-request tools')
    for (const e of tool.responseMap)
      if (!keys.includes(e.source)) issue(`responseMap source "${e.source}" has no matching request`)
  })

export const AuthSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bearer'), envVar: z.string().min(1) }),
  z.object({ type: z.literal('header'), header: z.string().min(1), envVar: z.string().min(1) }),
  z.object({ type: z.literal('basic'), userEnvVar: z.string().min(1), passEnvVar: z.string().min(1) }),
  z.object({ type: z.literal('none') })
])

export const HiddenEndpointSchema = z.object({ endpoint: z.string().min(1), reason: z.string().default('') })

export const ManifestSchema = z.object({
  agentifyVersion: z.literal(1),
  api: z.object({ name: z.string().min(1), baseUrl: z.string().url(), auth: AuthSchema }),
  tools: z.array(ToolSchema).min(1),
  hiddenEndpoints: z.array(HiddenEndpointSchema).default([])
})

// What the LLM is allowed to produce — everything else is assembled in code.
export const PartialAnalysisSchema = z.object({
  tools: z.array(ToolSchema).min(1),
  hiddenEndpoints: z.array(HiddenEndpointSchema).default([])
})

export type Manifest = z.infer<typeof ManifestSchema>
export type ManifestTool = z.infer<typeof ToolSchema>
export type ManifestAuth = z.infer<typeof AuthSchema>
export type ResponseMapEntry = z.infer<typeof ResponseMapEntrySchema>
export type ToolParam = z.infer<typeof ToolParamSchema>
export type PartialAnalysis = z.infer<typeof PartialAnalysisSchema>
