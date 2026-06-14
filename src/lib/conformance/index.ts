import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import type {DiscoveryReport} from '../spec/model.js'
import type {ConformanceCheck} from '../config.js'

const run = promisify(execFile)

export interface DriftItem {
  kind: 'operation' | 'scope' | 'table' | 'topic'
  change: 'added' | 'removed'
  detail: string
}

export interface CheckResult {
  name: string
  passed: boolean
  output: string
}

export interface ConformanceReport {
  generatedAt: string
  hasBaseline: boolean
  drift: DriftItem[]
  checks: CheckResult[]
  conformant: boolean
}

const opKey = (o: {method: string; path: string}) => `${o.method.toUpperCase()} ${o.path}`

// Structural drift: what the running code exposes NOW vs the baseline the base
// spec was generated/confirmed from. Anything here means the spec is out of date.
export function structuralDrift(baseline: DiscoveryReport, current: DiscoveryReport): DriftItem[] {
  const drift: DriftItem[] = []

  const diffSet = (
    kind: DriftItem['kind'],
    base: string[],
    cur: string[],
  ): void => {
    const b = new Set(base)
    const c = new Set(cur)
    for (const x of cur) if (!b.has(x)) drift.push({kind, change: 'added', detail: x})
    for (const x of base) if (!c.has(x)) drift.push({kind, change: 'removed', detail: x})
  }

  diffSet('operation', baseline.api.operations.map(opKey), current.api.operations.map(opKey))
  diffSet('scope', baseline.security.scopes, current.security.scopes)
  diffSet('table', baseline.data.tables.map((t) => t.name), current.data.tables.map((t) => t.name))
  diffSet(
    'topic',
    baseline.events.topics.map((t) => `${t.name} (${t.role})`),
    current.events.topics.map((t) => `${t.name} (${t.role})`),
  )
  return drift
}

export async function runCheck(check: ConformanceCheck, cwd: string): Promise<CheckResult> {
  try {
    const {stdout, stderr} = await run('sh', ['-c', check.run], {cwd, maxBuffer: 10 * 1024 * 1024})
    return {name: check.name, passed: true, output: (stdout + stderr).trim().slice(-2000)}
  } catch (e) {
    const err = e as {stdout?: string; stderr?: string; message?: string}
    const output = ((err.stdout ?? '') + (err.stderr ?? '') || err.message || String(e)).trim()
    return {name: check.name, passed: false, output: output.slice(-2000)}
  }
}
