import { AuditBaselineComparison, AuditFinding, AuditPolicy, ToolAudit } from './schema.js'
import { severityForFinding } from './config.js'

interface BaselineReportLike {
  summary?: {
    averageScore?: unknown
  }
  tools?: unknown
}

interface ToolLike {
  name?: unknown
  description?: unknown
  discoverabilityScore?: unknown
  findings?: unknown
  issues?: unknown
  role?: unknown
}

export function compareAuditBaseline(currentTools: ToolAudit[], baselineReport: unknown, policy: AuditPolicy): AuditBaselineComparison {
  const beforeTools = normalizeTools(baselineReport)
  const beforeScores = new Map(beforeTools.map((tool) => [tool.name, tool.discoverabilityScore]))
  const beforeNames = new Set(beforeTools.map((tool) => tool.name))
  const afterNames = new Set(currentTools.map((tool) => tool.name))
  const averageScoreBefore = averageScore(beforeTools, baselineReport)
  const averageScoreAfter = averageScore(currentTools)
  const scoreDelta = roundScore(averageScoreAfter - averageScoreBefore)
  const newTools = currentTools.map((tool) => tool.name).filter((name) => !beforeNames.has(name)).sort()
  const removedTools = beforeTools.map((tool) => tool.name).filter((name) => !afterNames.has(name)).sort()
  const regressedTools = currentTools
    .filter((tool) => beforeScores.has(tool.name))
    .map((tool) => {
      const before = beforeScores.get(tool.name) ?? tool.discoverabilityScore
      return {
        name: tool.name,
        before,
        after: tool.discoverabilityScore,
        delta: roundScore(tool.discoverabilityScore - before)
      }
    })
    .filter((tool) => tool.delta < 0)
    .sort((a, b) => a.delta - b.delta || a.name.localeCompare(b.name))

  const newFailingFindings: AuditFinding[] = []
  if (policy.thresholds.maxScoreDrop > 0 && scoreDelta < -policy.thresholds.maxScoreDrop) {
    newFailingFindings.push({
      id: 'score_regression',
      severity: severityForFinding(policy, 'score_regression', 'warn'),
      message: `Average score dropped by ${Math.abs(scoreDelta)} points, above the configured ${policy.thresholds.maxScoreDrop}-point limit.`,
      scoreImpact: scoreDelta,
      recommendation: 'Review new or changed tool descriptions before updating the baseline.'
    })
  }
  if (policy.thresholds.minAverageScore > 0 && averageScoreAfter < policy.thresholds.minAverageScore) {
    newFailingFindings.push({
      id: 'score_regression',
      severity: severityForFinding(policy, 'score_regression', 'warn'),
      message: `Average score ${averageScoreAfter} is below the configured minimum ${policy.thresholds.minAverageScore}.`,
      scoreImpact: roundScore(averageScoreAfter - policy.thresholds.minAverageScore),
      recommendation: 'Improve low-scoring tools or lower the threshold for this server type.'
    })
  }
  for (const tool of currentTools) {
    if (policy.thresholds.minToolScore > 0 && tool.discoverabilityScore < policy.thresholds.minToolScore) {
      newFailingFindings.push({
        id: 'new_low_scoring_tool',
        severity: 'fail',
        message: `Tool score ${tool.discoverabilityScore} is below the configured minimum ${policy.thresholds.minToolScore}.`,
        tool: tool.name,
        scoreImpact: tool.discoverabilityScore - policy.thresholds.minToolScore,
        recommendation: 'Improve the tool description, required inputs, or safety wording.'
      })
    }
  }
  for (const toolName of newTools) {
    const tool = currentTools.find((candidate) => candidate.name === toolName)
    if (!tool) continue
    if (policy.rules.requireDescriptions && tool.description.trim().length === 0) {
      newFailingFindings.push({
        id: 'new_tool_without_description',
        severity: 'fail',
        message: 'New tool lacks a top-level MCP description.',
        tool: tool.name,
        scoreImpact: -24,
        recommendation: 'Add a concise user-intent description before shipping.'
      })
    }
    if (policy.rules.requireSafetyForDestructive && tool.role === 'destructive') {
      const unsafe = tool.findings.find((finding) => finding.id === 'unsafe_destructive_tool')
      if (unsafe) {
        newFailingFindings.push({
          id: 'new_destructive_tool_without_safety',
          severity: 'fail',
          message: 'New destructive tool lacks explicit confirmation, safety, or review wording.',
          tool: tool.name,
          scoreImpact: unsafe.scoreImpact,
          recommendation: unsafe.recommendation
        })
      }
    }
  }

  return {
    averageScoreBefore,
    averageScoreAfter,
    scoreDelta,
    newTools,
    removedTools,
    regressedTools,
    newFailingFindings
  }
}

function normalizeTools(report: unknown): ToolAudit[] {
  const value = report as BaselineReportLike
  if (!Array.isArray(value?.tools)) return []
  return value.tools
    .map((entry): ToolAudit | undefined => {
      const tool = entry as ToolLike
      if (typeof tool.name !== 'string') return undefined
      const discoverabilityScore = typeof tool.discoverabilityScore === 'number' ? tool.discoverabilityScore : 0
      return {
        name: tool.name,
        description: typeof tool.description === 'string' ? tool.description : '',
        workflow: '',
        role: tool.role === 'destructive' ? 'destructive' : 'write',
        discoverabilityScore,
        callCount: 0,
        errorCount: 0,
        errorRate: 0,
        requiredInputCount: 0,
        findings: [],
        issues: [],
        recommendations: []
      }
    })
    .filter((tool): tool is ToolAudit => Boolean(tool))
}

function averageScore(tools: ToolAudit[], report?: unknown): number {
  const reportAverage = (report as BaselineReportLike | undefined)?.summary?.averageScore
  if (typeof reportAverage === 'number') return roundScore(reportAverage)
  if (tools.length === 0) return 0
  return roundScore(tools.reduce((sum, tool) => sum + tool.discoverabilityScore, 0) / tools.length)
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10
}
