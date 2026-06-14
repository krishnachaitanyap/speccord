import type {AnalysisFinding} from './model.js'
import {countClarifications} from './model.js'
import {parseTasks} from './tasks.js'
import {constitutionPrinciples} from './constitution.js'

// Deterministic cross-artifact consistency check across spec / plan / tasks /
// constitution. This is the `analyze` engine — it finds DISAGREEMENTS between
// artifacts (the gaps that silently break the spec↔code contract), no LLM needed.
export function analyzeArtifacts(args: {
  specBody: string
  planText?: string
  tasksText?: string
  constitution?: string
}): AnalysisFinding[] {
  const findings: AnalysisFinding[] = []
  const {specBody, planText, tasksText, constitution} = args

  const refs = (re: RegExp, text: string): string[] =>
    [...new Set([...text.matchAll(re)].map((m) => m[0]))].sort()

  const acs = refs(/\bAC-\d+\b/g, specBody)
  const frs = refs(/\bFR-\d+\b/g, specBody)

  // 1) Open clarifications block everything downstream.
  const open = countClarifications(specBody)
  if (open > 0)
    findings.push({
      level: 'error',
      area: 'clarity',
      message: `${open} unresolved [NEEDS CLARIFICATION] marker(s) in the spec`,
    })

  // 2) Every AC must link to a test.
  const acLines = specBody.split('\n').filter((l) => /\bAC-\d+\b/.test(l))
  for (const line of acLines) {
    if (!/\[test:\s*\S+\]/i.test(line)) {
      const ac = line.match(/AC-\d+/)?.[0] ?? 'AC'
      findings.push({level: 'error', area: 'coverage', message: `${ac} is not linked to a test`})
    }
  }
  if (acs.length === 0)
    findings.push({level: 'error', area: 'coverage', message: 'spec declares no acceptance criteria (AC-n)'})

  // 3) Plan presence + constitution check + AC coverage.
  if (planText === undefined) {
    findings.push({level: 'warn', area: 'consistency', message: 'no plan found — run `speccord plan`'})
  } else {
    if (!/##\s*\d*\.?\s*Constitution check/i.test(planText))
      findings.push({
        level: 'warn',
        area: 'constitution',
        message: 'plan has no "Constitution check" section',
      })
    if (constitution) {
      const principles = constitutionPrinciples(constitution)
      const cited = new Set(refs(/\bP-\d+\b/g, planText))
      const missing = principles.filter((p) => !cited.has(p))
      if (principles.length && missing.length === principles.length)
        findings.push({
          level: 'warn',
          area: 'constitution',
          message: 'plan does not reference any constitution principle (P-n)',
        })
    }
  }

  // 4) Tasks must exist and cover every AC; flag orphan AC refs.
  if (tasksText === undefined) {
    findings.push({level: 'warn', area: 'consistency', message: 'no tasks found — run `speccord tasks`'})
  } else {
    const tasks = parseTasks(tasksText)
    if (tasks.length === 0)
      findings.push({level: 'error', area: 'consistency', message: 'tasks file has no parsable tasks'})
    const acsInTasks = new Set(refs(/\bAC-\d+\b/g, tasksText))
    for (const ac of acs)
      if (!acsInTasks.has(ac))
        findings.push({
          level: 'warn',
          area: 'coverage',
          message: `${ac} is not referenced by any task`,
        })
    // Tasks referencing ACs that don't exist in the spec.
    for (const ac of acsInTasks)
      if (!acs.includes(ac))
        findings.push({
          level: 'error',
          area: 'consistency',
          message: `tasks reference ${ac}, which is not in the spec`,
        })
  }

  // 5) FR present (advisory).
  if (frs.length === 0)
    findings.push({level: 'info', area: 'coverage', message: 'spec declares no functional requirements (FR-n)'})

  return findings
}
