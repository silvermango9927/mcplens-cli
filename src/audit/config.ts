import path from 'node:path'
import { z } from 'zod'
import { readJsonFile } from '../util/fs.js'
import { AuditFindingId, AuditPolicy, AuditProfileName, AuditSeverity } from './schema.js'

const FindingIdSchema = z.enum([
  'missing_description',
  'missing_trigger_language',
  'description_too_short',
  'description_too_long',
  'implementation_oriented_description',
  'unsafe_write_tool',
  'unsafe_destructive_tool',
  'tool_overlap',
  'catch_all_tool',
  'generic_tool_name',
  'weak_required_input',
  'too_many_required_inputs',
  'score_regression',
  'new_low_scoring_tool',
  'new_tool_without_description',
  'new_destructive_tool_without_safety'
])

const ProfileSchema = z.enum(['production', 'local-dev', 'read-only', 'concise'])

const FlagToolOverlapSchema = z.union([z.enum(['off', 'info', 'warn', 'fail']), z.boolean()])

const PartialAuditConfigSchema = z
  .object({
    profile: ProfileSchema.optional(),
    descriptionStyle: z.enum(['concise', 'structured']).optional(),
    failOn: z.array(FindingIdSchema).optional(),
    thresholds: z
      .object({
        minAverageScore: z.number().min(0).max(100).optional(),
        maxScoreDrop: z.number().min(0).max(100).optional(),
        minToolScore: z.number().min(0).max(100).optional()
      })
      .optional(),
    rules: z
      .object({
        requireDescriptions: z.boolean().optional(),
        requireUseWhen: z.boolean().optional(),
        requireSafetyForDestructive: z.boolean().optional(),
        requireSafetyForWrite: z.boolean().optional(),
        flagCatchAllTools: z.boolean().optional(),
        flagToolOverlap: FlagToolOverlapSchema.optional(),
        allowReadOnlyWithoutSafety: z.boolean().optional()
      })
      .optional()
  })
  .strict()

export type PartialAuditConfig = z.infer<typeof PartialAuditConfigSchema>

const PROFILE_DEFAULTS: Record<AuditProfileName, AuditPolicy> = {
  production: {
    profile: 'production',
    descriptionStyle: 'structured',
    failOn: ['missing_description', 'unsafe_destructive_tool', 'score_regression'],
    thresholds: {
      minAverageScore: 0,
      maxScoreDrop: 5,
      minToolScore: 0
    },
    rules: {
      requireDescriptions: true,
      requireUseWhen: false,
      requireSafetyForDestructive: true,
      requireSafetyForWrite: true,
      flagCatchAllTools: true,
      flagToolOverlap: 'warn',
      allowReadOnlyWithoutSafety: true
    }
  },
  'local-dev': {
    profile: 'local-dev',
    descriptionStyle: 'structured',
    failOn: ['missing_description', 'score_regression'],
    thresholds: {
      minAverageScore: 0,
      maxScoreDrop: 5,
      minToolScore: 0
    },
    rules: {
      requireDescriptions: true,
      requireUseWhen: false,
      requireSafetyForDestructive: false,
      requireSafetyForWrite: false,
      flagCatchAllTools: true,
      flagToolOverlap: 'warn',
      allowReadOnlyWithoutSafety: true
    }
  },
  'read-only': {
    profile: 'read-only',
    descriptionStyle: 'structured',
    failOn: ['missing_description', 'score_regression'],
    thresholds: {
      minAverageScore: 0,
      maxScoreDrop: 5,
      minToolScore: 0
    },
    rules: {
      requireDescriptions: true,
      requireUseWhen: false,
      requireSafetyForDestructive: true,
      requireSafetyForWrite: false,
      flagCatchAllTools: false,
      flagToolOverlap: 'info',
      allowReadOnlyWithoutSafety: true
    }
  },
  concise: {
    profile: 'concise',
    descriptionStyle: 'concise',
    failOn: ['missing_description', 'unsafe_destructive_tool', 'score_regression'],
    thresholds: {
      minAverageScore: 0,
      maxScoreDrop: 5,
      minToolScore: 0
    },
    rules: {
      requireDescriptions: true,
      requireUseWhen: false,
      requireSafetyForDestructive: true,
      requireSafetyForWrite: false,
      flagCatchAllTools: true,
      flagToolOverlap: 'info',
      allowReadOnlyWithoutSafety: true
    }
  }
}

export async function loadAuditPolicy(configPath?: string): Promise<AuditPolicy> {
  if (!configPath) return resolveAuditPolicy({})
  const raw = await readJsonFile(path.resolve(configPath))
  const parsed = PartialAuditConfigSchema.parse(raw)
  return resolveAuditPolicy(parsed)
}

export function resolveAuditPolicy(config: PartialAuditConfig): AuditPolicy {
  const profile = config.profile ?? 'production'
  const defaults = PROFILE_DEFAULTS[profile]
  return {
    profile,
    descriptionStyle: config.descriptionStyle ?? defaults.descriptionStyle,
    failOn: config.failOn ? [...config.failOn] : [...defaults.failOn],
    thresholds: {
      ...defaults.thresholds,
      ...config.thresholds
    },
    rules: {
      ...defaults.rules,
      ...config.rules,
      flagToolOverlap: normalizeOverlapSeverity(config.rules?.flagToolOverlap ?? defaults.rules.flagToolOverlap)
    }
  }
}

export function severityForFinding(policy: AuditPolicy, id: AuditFindingId, fallback: AuditSeverity = 'warn'): AuditSeverity {
  if (policy.failOn.includes(id)) return 'fail'
  if (id === 'tool_overlap') return policy.rules.flagToolOverlap === 'off' ? 'info' : policy.rules.flagToolOverlap
  return fallback
}

function normalizeOverlapSeverity(value: AuditPolicy['rules']['flagToolOverlap'] | boolean): AuditSeverity | 'off' {
  if (value === true) return 'warn'
  if (value === false) return 'off'
  return value
}
