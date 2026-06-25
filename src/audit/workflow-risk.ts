import { ToolAudit } from './schema.js'

export const CONTRIBUTION_GATE_WARNING =
  'Extra confirmation/posting steps may reduce activation if agents do not reliably call follow-up tools. Consider measuring completion rate before adding safety gates.'

const CONTRIBUTION_TERMS = new Set([
  'contribution',
  'contribute',
  'submission',
  'submit',
  'submitted',
  'draft',
  'public',
  'post',
  'posting',
  'publish',
  'publishing',
  'solution',
  'solutions',
  'learning',
  'learnings'
])

export function isContributionSubmissionWorkflow(tool: Pick<ToolAudit, 'name' | 'workflow' | 'description'>): boolean {
  return tokenize(`${tool.name} ${tool.workflow} ${tool.description}`).some((token) => CONTRIBUTION_TERMS.has(token))
}

export function isContributionSubmissionGate(tool: Pick<ToolAudit, 'name' | 'workflow' | 'description' | 'role'>): boolean {
  if (!['preview', 'write', 'confirm', 'reject'].includes(tool.role)) return false
  return isContributionSubmissionWorkflow(tool)
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}
