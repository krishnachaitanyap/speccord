import {join} from 'node:path'
import {readFile, writeFile} from 'node:fs/promises'
import fg from 'fast-glob'
import {loadConfig, type SpeccordConfig} from './config.js'
import {readSpec, writeSpec} from './spec/frontmatter.js'
import {lintFeatureSpec, type LintIssue} from './spec/templates.js'
import {analyzeArtifacts} from './spec/analyze.js'
import {loadConstitution} from './spec/constitution.js'
import {loadFeature, gateContextFor} from './spec/feature.js'
import {parseTasks, setTaskDone} from './spec/tasks.js'
import {storyTaskPrompt, STORY_TRANSITIONS, type StoryFrontMatter, type StoryStatus} from './spec/story.js'
import {getPersona} from './agents.js'
import {TRANSITIONS, gateFor, type SpecStatus, type AnalysisFinding, type TaskItem} from './spec/model.js'
import {discover} from './discovery/index.js'
import {structuralDrift, runCheck, type ConformanceReport} from './conformance/index.js'
import {runGate, type GateResult} from './gate.js'
import {BASELINE_PATH, SPECCORD_DIR, ensureDir} from './config.js'
import {scaleByLevel} from './methodology.js'
import type {DiscoveryReport} from './spec/model.js'

const ARTIFACT_IGNORE = ['**/*.plan.md', '**/*.tasks.md', '**/*.checklist.md', '**/*.prompts.md']

// ---- read ----

export interface CapabilitiesView {
  service: string
  pack?: string
  preset?: string
  scale: {level: number; name: string; blurb: string}
  phases: string[]
  roles: string[]
  capabilities: Record<string, boolean>
}

export async function actionCapabilities(cwd: string): Promise<CapabilitiesView | null> {
  const cfg = await loadConfig(cwd)
  if (!cfg) return null
  const lvl = scaleByLevel(cfg.methodology.scale)
  return {
    service: cfg.service,
    pack: cfg.pack,
    preset: cfg.preset,
    scale: {level: lvl.level, name: lvl.name, blurb: lvl.blurb},
    phases: cfg.methodology.phases,
    roles: cfg.methodology.roles,
    capabilities: cfg.capabilities,
  }
}

export async function readFileSafe(cwd: string, rel: string): Promise<string | null> {
  try {
    return await readFile(join(cwd, rel), 'utf8')
  } catch {
    return null
  }
}

export interface SpecRow {
  id: string
  status: string
  base: string
  file: string
}

export async function actionStatus(cwd: string, cfg?: SpeccordConfig): Promise<SpecRow[]> {
  const c = cfg ?? (await loadConfig(cwd))
  const specsDir = c?.specsDir ?? 'specs'
  const files = await fg([`${specsDir}/**/*.md`], {
    cwd,
    absolute: true,
    ignore: ['**/templates/**', '**/constitution.md', ...ARTIFACT_IGNORE],
    suppressErrors: true,
  })
  const rows: SpecRow[] = []
  for (const f of files) {
    const {frontMatter} = await readSpec(f)
    rows.push({
      id: String(frontMatter.id ?? frontMatter.service ?? f.split('/').pop()),
      status: String(frontMatter.status ?? '—'),
      base: frontMatter.baseVersion ? `v${frontMatter.baseVersion}` : '(base)',
      file: f.replace(cwd, '.'),
    })
  }
  return rows.sort((a, b) => a.status.localeCompare(b.status))
}

// ---- verify ----

export interface AnalyzeResult {
  spec: string
  findings: AnalysisFinding[]
  errors: number
  warnings: number
  ok: boolean
}

export async function actionAnalyze(cwd: string, specPath: string): Promise<AnalyzeResult> {
  const cfg = await loadConfig(cwd)
  const feature = await loadFeature(cwd, specPath)
  const constitution = cfg ? (await loadConstitution(join(cwd, cfg.constitution))) ?? undefined : undefined
  const findings = analyzeArtifacts({
    specBody: feature.spec.body,
    planText: feature.planText,
    tasksText: feature.tasksText,
    constitution,
  })
  const errors = findings.filter((f) => f.level === 'error').length
  const warnings = findings.filter((f) => f.level === 'warn').length
  return {spec: specPath, findings, errors, warnings, ok: errors === 0}
}

export interface LintFileResult {
  file: string
  issues: LintIssue[]
}
export interface LintResult {
  files: LintFileResult[]
  errors: number
  ok: boolean
}

export async function actionLint(cwd: string, path?: string): Promise<LintResult> {
  const cfg = await loadConfig(cwd)
  const featuresDir = cfg?.featuresDir ?? 'specs/features'
  const files = path
    ? [join(cwd, path)]
    : await fg([`${featuresDir}/**/*.md`], {cwd, absolute: true, ignore: ARTIFACT_IGNORE, suppressErrors: true})
  const out: LintFileResult[] = []
  let errors = 0
  for (const f of files) {
    const {frontMatter, body} = await readSpec(f)
    const issues = lintFeatureSpec(frontMatter, body)
    errors += issues.filter((i) => i.level === 'error').length
    out.push({file: f.replace(cwd, '.'), issues})
  }
  return {files: out, errors, ok: errors === 0}
}

export async function actionGate(cwd: string, base: string): Promise<GateResult> {
  const cfg = await loadConfig(cwd)
  return runGate(cwd, cfg, base)
}

export async function actionConform(
  cwd: string,
  root = '.',
  opts: {skipChecks?: boolean} = {},
): Promise<ConformanceReport> {
  const cfg = await loadConfig(cwd)
  let baseline: DiscoveryReport | undefined
  try {
    baseline = JSON.parse(await readFile(join(cwd, BASELINE_PATH), 'utf8'))
  } catch {
    baseline = undefined
  }
  const drift =
    baseline && (cfg?.conformance.checkStructuralDrift ?? true)
      ? structuralDrift(baseline, await discover(root, cfg?.service, cfg?.discovery))
      : []
  const checks =
    opts.skipChecks || !cfg ? [] : await Promise.all(cfg.conformance.checks.map((c) => runCheck(c, cwd)))
  return {
    generatedAt: new Date().toISOString(),
    hasBaseline: Boolean(baseline),
    drift,
    checks,
    conformant: drift.length === 0 && checks.every((c) => c.passed),
  }
}

export async function actionDiscover(cwd: string, root = '.'): Promise<DiscoveryReport> {
  const cfg = await loadConfig(cwd)
  return discover(root, cfg?.service, cfg?.discovery)
}

export async function actionUpdateBaseline(cwd: string, root = '.'): Promise<DiscoveryReport> {
  const cfg = await loadConfig(cwd)
  const current = await discover(root, cfg?.service, cfg?.discovery)
  await ensureDir(join(cwd, SPECCORD_DIR))
  await writeFile(join(cwd, BASELINE_PATH), JSON.stringify(current, null, 2))
  return current
}

// ---- transition ----

export interface AdvanceResult {
  ok: boolean
  from: string
  to: string
  problems: string[]
  error?: string
}

export async function actionAdvance(cwd: string, specPath: string, to: string): Promise<AdvanceResult> {
  const cfg = await loadConfig(cwd)
  const feature = await loadFeature(cwd, specPath)
  const current = (feature.spec.frontMatter.status as SpecStatus) ?? 'Draft'
  const target = to as SpecStatus
  const allowed = TRANSITIONS[current] ?? []
  if (!allowed.includes(target))
    return {ok: false, from: current, to, problems: [], error: `illegal transition; allowed: ${allowed.join(', ') || '(none)'}`}
  const problems = gateFor(target, gateContextFor(feature), cfg?.customization ?? {})
  if (problems.length) return {ok: false, from: current, to, problems}
  feature.spec.frontMatter.status = target
  feature.spec.frontMatter.updated = new Date().toISOString().slice(0, 10)
  await writeSpec(feature.specPath, feature.spec)
  return {ok: true, from: current, to, problems: []}
}

export interface StoryRow {
  id: string
  status: string
  epic: string
  title: string
  file: string
}

async function storyFiles(cwd: string, cfg?: SpeccordConfig): Promise<string[]> {
  const dir = cfg?.storiesDir ?? 'specs/stories'
  return fg(['STORY-*.md'], {cwd: `${cwd}/${dir}`, absolute: true, ignore: ['**/*.prompts.md'], suppressErrors: true})
}

export async function actionStories(cwd: string): Promise<StoryRow[]> {
  const cfg = await loadConfig(cwd)
  const files = await storyFiles(cwd, cfg)
  const rows: StoryRow[] = []
  for (const f of files.sort()) {
    const {frontMatter} = await readSpec(f)
    const fm = frontMatter as StoryFrontMatter
    rows.push({
      id: String(fm.id ?? '?'),
      status: String(fm.storyStatus ?? 'Draft'),
      epic: String(fm.epic ?? '—'),
      title: String(fm.title ?? ''),
      file: f.replace(cwd, '.'),
    })
  }
  return rows
}

export async function actionStoryNext(cwd: string): Promise<StoryRow | null> {
  const rows = await actionStories(cwd)
  const ordered = rows.sort(
    (a, b) => Number(a.id.match(/\d+/)?.[0] ?? 0) - Number(b.id.match(/\d+/)?.[0] ?? 0),
  )
  return ordered.find((r) => r.status !== 'Done') ?? null
}

export async function actionStoryAdvance(cwd: string, path: string, to: string): Promise<AdvanceResult> {
  const story = await readSpec(join(cwd, path))
  const fm = story.frontMatter as StoryFrontMatter
  const current = (fm.storyStatus ?? 'Draft') as StoryStatus
  const target = to as StoryStatus
  const allowed = STORY_TRANSITIONS[current] ?? []
  if (!allowed.includes(target))
    return {ok: false, from: current, to, problems: [], error: `illegal transition; allowed: ${allowed.join(', ') || '(none)'}`}
  fm.storyStatus = target
  fm.updated = new Date().toISOString().slice(0, 10)
  await writeSpec(join(cwd, path), story)
  return {ok: true, from: current, to, problems: []}
}

// Resolve a story by id (STORY-3) or by repo-relative path.
async function resolveStoryPath(cwd: string, ref: string): Promise<string | null> {
  if (ref.endsWith('.md')) return join(cwd, ref.replace(/^\.\//, ''))
  const row = (await actionStories(cwd)).find((r) => r.id === ref)
  return row ? join(cwd, row.file.replace(/^\.\//, '')) : null
}

async function readMaybeAbs(p: string): Promise<string> {
  try {
    return await readFile(p, 'utf8')
  } catch {
    return ''
  }
}

export interface StoryTask extends TaskItem {
  prompt: string // grounded dev prompt for this task
}
export interface StoryTasksResult {
  id: string
  title: string
  status: string
  tasks: StoryTask[]
}

// Return a story's tasks, each with a self-contained dev prompt the agent can
// implement directly (the MCP equivalent of the story dev loop).
export async function actionStoryTasks(cwd: string, ref: string): Promise<StoryTasksResult> {
  const path = await resolveStoryPath(cwd, ref)
  if (!path) throw new Error(`story not found: ${ref}`)
  const cfg = await loadConfig(cwd)
  const story = await readSpec(path)
  const fm = story.frontMatter as StoryFrontMatter
  const constitution = cfg ? (await loadConstitution(join(cwd, cfg.constitution))) || '(none)' : '(none)'
  const baseSpec = cfg ? (await readMaybeAbs(join(cwd, cfg.baseSpec))) || '(none)' : '(none)'
  const devSystem = getPersona('dev').system
  const tasks = parseTasks(story.body).map((task) => ({
    ...task,
    prompt: storyTaskPrompt({
      devSystem,
      constitution,
      baseSpec,
      id: String(fm.id ?? ''),
      title: String(fm.title ?? ''),
      body: story.body,
      task,
    }),
  }))
  return {id: String(fm.id ?? ''), title: String(fm.title ?? ''), status: String(fm.storyStatus ?? 'Draft'), tasks}
}

export interface MarkTaskResult {
  taskId: string
  done: boolean
  remaining: number
  status: string
}

// Check/uncheck a story task. When the last task is done, move the story to Review.
export async function actionMarkTask(
  cwd: string,
  ref: string,
  taskId: string,
  done = true,
): Promise<MarkTaskResult> {
  const path = await resolveStoryPath(cwd, ref)
  if (!path) throw new Error(`story not found: ${ref}`)
  const story = await readSpec(path)
  const fm = story.frontMatter as StoryFrontMatter
  story.body = setTaskDone(story.body, taskId, done)
  const remaining = parseTasks(story.body).filter((t) => !t.done).length
  if (remaining === 0 && fm.storyStatus !== 'Done') fm.storyStatus = 'Review'
  else if ((fm.storyStatus ?? 'Draft') === 'Draft' || fm.storyStatus === 'Ready') fm.storyStatus = 'In Progress'
  fm.updated = new Date().toISOString().slice(0, 10)
  await writeSpec(path, story)
  return {taskId, done, remaining, status: String(fm.storyStatus)}
}

export interface NextAction {
  action: string
  command: string
  reason: string
  ref?: string
}

// Heuristic "what should I do next?" — drives an agent through the workflow from
// one entry point. Deterministic: based on config + artifact state, not a model.
export async function actionNextAction(cwd: string): Promise<NextAction> {
  const cfg = await loadConfig(cwd)
  if (!cfg) return {action: 'init', command: 'speccord init', reason: 'no speccord.config.yaml found'}

  const baseSpec = await readFileSafe(cwd, cfg.baseSpec)
  if (!baseSpec)
    return {
      action: 'create-base-spec',
      command: 'speccord discover && speccord base draft   (existing service)   |   speccord base new --intent "..."   (new service)',
      reason: 'no base spec yet — establish the contract first',
    }

  // Story-driven work takes priority when stories exist.
  const next = await actionStoryNext(cwd)
  if (next) {
    const map: Record<string, NextAction> = {
      Draft: {action: 'refine-story', command: `speccord story advance ${next.file} --to Ready`, reason: `${next.id} is a draft`, ref: next.id},
      Ready: {action: 'implement-story', command: `speccord story implement ${next.file}`, reason: `${next.id} is ready to build`, ref: next.id},
      'In Progress': {action: 'continue-story', command: `speccord story implement ${next.file}`, reason: `${next.id} is in progress`, ref: next.id},
      Review: {action: 'review-story', command: `speccord review ${next.file} --lens edge-cases`, reason: `${next.id} awaits QA review`, ref: next.id},
    }
    return map[next.status] ?? {action: 'implement-story', command: `speccord story implement ${next.file}`, reason: `work ${next.id}`, ref: next.id}
  }

  // Otherwise advance the most actionable feature spec.
  const rows = await actionStatus(cwd, cfg)
  const feature = rows.find((r) => ['Draft', 'In Review', 'Approved'].includes(r.status))
  if (feature) {
    const byStatus: Record<string, NextAction> = {
      Draft: {action: 'plan-feature', command: `speccord clarify ${feature.file} && speccord plan ${feature.file} && speccord tasks ${feature.file}`, reason: `${feature.id} needs a plan + tasks`, ref: feature.id},
      'In Review': {action: 'approve-feature', command: `speccord analyze ${feature.file} && speccord advance ${feature.file} --to Approved`, reason: `${feature.id} is in review`, ref: feature.id},
      Approved: {action: 'start-implementation', command: `speccord advance ${feature.file} --to "In Implementation"`, reason: `${feature.id} is approved`, ref: feature.id},
    }
    return byStatus[feature.status]
  }

  // Nothing pending — verify the contract still holds.
  return {action: 'verify', command: 'speccord gate && speccord conform', reason: 'no open work — check the spec↔code contract holds'}
}
