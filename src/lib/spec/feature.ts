import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {readSpec, type ParsedSpec} from './frontmatter.js'
import {artifactPaths, countClarifications, type GateContext} from './model.js'
import {lintFeatureSpec} from './templates.js'
import {checklistComplete} from './checklist.js'

async function readMaybe(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

export interface LoadedFeature {
  specPath: string
  spec: ParsedSpec
  paths: ReturnType<typeof artifactPaths>
  planText?: string
  tasksText?: string
  checklistText?: string
}

// Load a feature spec together with whatever sibling artifacts exist on disk.
export async function loadFeature(cwd: string, relSpecPath: string): Promise<LoadedFeature> {
  const specPath = join(cwd, relSpecPath)
  const paths = artifactPaths(specPath)
  const spec = await readSpec(specPath)
  const [planText, tasksText, checklistText] = await Promise.all([
    readMaybe(paths.plan),
    readMaybe(paths.tasks),
    readMaybe(paths.checklist),
  ])
  return {specPath, spec, paths, planText, tasksText, checklistText}
}

// Build the lifecycle entry-gate context from a loaded feature.
export function gateContextFor(f: LoadedFeature): GateContext {
  const {spec} = f
  const lintIssues = lintFeatureSpec(spec.frontMatter, spec.body)
  const acLines = spec.body.split('\n').filter((l) => /\bAC-\d+\b/.test(l))
  return {
    lintPassed: lintIssues.filter((i) => i.level === 'error').length === 0,
    hasBaseRef: Boolean(spec.frontMatter.base && spec.frontMatter.baseVersion),
    acsHaveTests: acLines.length > 0 && acLines.every((l) => /\[test:\s*\S+\]/i.test(l)),
    hasPlan: f.planText !== undefined,
    hasTasks: f.tasksText !== undefined,
    hasChecklist: f.checklistText !== undefined,
    checklistComplete: f.checklistText ? checklistComplete(f.checklistText) : false,
    unresolvedClarifications: countClarifications(spec.body),
  }
}
