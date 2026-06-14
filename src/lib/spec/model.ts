// Core domain types shared across the CLI.

export interface ApiOperation {
  method: string
  path: string
  operationId?: string
  summary?: string
  scopes: string[]
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
}

export interface TableInfo {
  name: string
  columns: ColumnInfo[]
  primaryKey: string[]
  sourceFile: string
}

export interface TopicInfo {
  name: string
  role: 'produces' | 'consumes' | 'configured'
  source: string
}

export interface DiscoveryReport {
  generatedAt: string
  service: {name: string; root: string}
  api: {
    file?: string
    version?: string
    operations: ApiOperation[]
    securitySchemes: string[]
  }
  data: {tables: TableInfo[]; migrationFiles: string[]}
  events: {topics: TopicInfo[]}
  security: {
    resourceServer: boolean
    jwksConfigured: boolean
    scopes: string[]
    annotations: string[]
  }
  warnings: string[]
}

// A discovery report with no facts — the starting point for a greenfield base
// spec, where the contract surface is defined by intent and grows as features
// are implemented (rather than extracted from existing code).
export function emptyDiscoveryReport(serviceName: string, generatedAt: string): DiscoveryReport {
  return {
    generatedAt,
    service: {name: serviceName, root: '.'},
    api: {operations: [], securitySchemes: []},
    data: {tables: [], migrationFiles: []},
    events: {topics: []},
    security: {resourceServer: false, jwksConfigured: false, scopes: [], annotations: []},
    warnings: [],
  }
}

// ---- Spec lifecycle ----

export const SPEC_STATUSES = [
  'Draft',
  'In Review',
  'Approved',
  'In Implementation',
  'Implemented',
  'Superseded',
] as const

export type SpecStatus = (typeof SPEC_STATUSES)[number]

// Allowed forward transitions. Superseded is reachable from any non-terminal state.
export const TRANSITIONS: Record<SpecStatus, SpecStatus[]> = {
  Draft: ['In Review', 'Superseded'],
  'In Review': ['Approved', 'Draft', 'Superseded'],
  Approved: ['In Implementation', 'In Review', 'Superseded'],
  'In Implementation': ['Implemented', 'Superseded'],
  Implemented: ['Superseded'],
  Superseded: [],
}

// Gates that MUST pass before a spec may ENTER a given status.
// Returns a list of unmet requirements (empty = ok to enter).
export interface GateContext {
  lintPassed: boolean
  hasBaseRef: boolean
  acsHaveTests: boolean
  // Generative-workflow artifacts (optional; only enforced when policy asks).
  hasPlan?: boolean
  hasTasks?: boolean
  hasChecklist?: boolean
  checklistComplete?: boolean
  unresolvedClarifications?: number
}

// Customization knobs (set via config/preset) that turn optional gates on.
export interface GatePolicy {
  requireChecklistForApproval?: boolean
  requirePlanForImplementation?: boolean
  blockOnOpenClarifications?: boolean
}

export function gateFor(target: SpecStatus, ctx: GateContext, policy: GatePolicy = {}): string[] {
  const problems: string[] = []
  if (target === 'Approved') {
    if (!ctx.lintPassed) problems.push('spec lint must pass before approval')
    if (!ctx.hasBaseRef) problems.push('feature spec must reference a base spec version')
    if (policy.blockOnOpenClarifications && (ctx.unresolvedClarifications ?? 0) > 0)
      problems.push(
        `${ctx.unresolvedClarifications} unresolved [NEEDS CLARIFICATION] marker(s) — run \`speccord clarify\``,
      )
    if (policy.requireChecklistForApproval) {
      if (!ctx.hasChecklist) problems.push('a quality checklist is required — run `speccord checklist`')
      else if (!ctx.checklistComplete) problems.push('all checklist items must be checked before approval')
    }
  }
  if (target === 'In Implementation') {
    if (!ctx.acsHaveTests)
      problems.push('every acceptance criterion must link to at least one test before implementation')
    // Default ON: the forward workflow requires a plan + tasks before implementing.
    if (policy.requirePlanForImplementation !== false) {
      if (!ctx.hasPlan) problems.push('no implementation plan found — run `speccord plan`')
      if (!ctx.hasTasks) problems.push('no task breakdown found — run `speccord tasks`')
    }
  }
  return problems
}

export interface FrontMatter {
  id?: string
  title?: string
  status?: SpecStatus
  base?: string
  baseVersion?: string
  owner?: string
  created?: string
  updated?: string
  [key: string]: unknown
}

// ---- Generative-workflow artifacts ----

// A single unit of implementation work parsed from a tasks file.
export interface TaskItem {
  id: string // T-1
  title: string
  done: boolean
  files: string[] // target files the task touches (best-effort)
  parallel: boolean // can run concurrently with its siblings ([P] marker)
}

// One finding emitted by `analyze` when artifacts disagree.
export interface AnalysisFinding {
  level: 'error' | 'warn' | 'info'
  area: string // e.g. "coverage", "constitution", "consistency"
  message: string
}

// The set of sibling artifacts that hang off a single feature spec.
export interface FeatureArtifacts {
  spec: string
  plan: string
  tasks: string
  checklist: string
}

// Sibling-file convention: SPEC-142-foo.md -> SPEC-142-foo.{plan,tasks,checklist}.md
export function artifactPaths(specPath: string): FeatureArtifacts {
  const stem = specPath.replace(/\.md$/, '')
  return {
    spec: specPath,
    plan: `${stem}.plan.md`,
    tasks: `${stem}.tasks.md`,
    checklist: `${stem}.checklist.md`,
  }
}

// Count of unresolved clarification markers in a spec body.
export const CLARIFY_MARKER = '[NEEDS CLARIFICATION'

export function countClarifications(body: string): number {
  return body.split(CLARIFY_MARKER).length - 1
}
