import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import type {SpeccordConfig} from './config.js'

const run = promisify(execFile)

// Lightweight glob match (avoids an extra dep): supports **, *, and {a,b,c}.
export function matches(file: string, pattern: string): boolean {
  let re = ''
  let i = 0
  while (i < pattern.length) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*'
        i += 2
      } else {
        re += '[^/]*'
        i += 1
      }
    } else if (c === '{') {
      const end = pattern.indexOf('}', i)
      const alts = pattern.slice(i + 1, end).split(',')
      re += '(' + alts.map((a) => a.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|') + ')'
      i = end + 1
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
      i += 1
    }
  }
  return new RegExp('^' + re + '$').test(file)
}

export interface GateResult {
  pass: boolean
  contractChanged: string[]
  specChanged: boolean
  base: string
  error?: string
}

// The CI drift gate: fail if a contract-surface file changed without a spec
// file changing in the same diff. Pure data result so both the CLI and the MCP
// server can present it.
export async function runGate(cwd: string, cfg: SpeccordConfig | undefined, base: string): Promise<GateResult> {
  const surface = cfg?.contractSurface ?? ['**/openapi*.{yaml,yml,json}']
  const specsDir = cfg?.specsDir ?? 'specs'

  let changed: string[]
  try {
    const collect = async (gitArgs: string[]) => {
      const {stdout} = await run('git', gitArgs, {cwd})
      return stdout.split('\n').map((s) => s.trim()).filter(Boolean)
    }
    const sets = await Promise.all([
      collect(['diff', '--name-only', `${base}...HEAD`]).catch(() => []),
      collect(['diff', '--name-only']),
      collect(['diff', '--name-only', '--cached']),
    ])
    changed = [...new Set(sets.flat())]
  } catch (e) {
    return {pass: false, contractChanged: [], specChanged: false, base, error: `git diff failed: ${String(e)}`}
  }

  const contractChanged = changed.filter((f) => surface.some((p) => matches(f, p)))
  const specChanged = changed.some((f) => f.startsWith(specsDir + '/'))
  const pass = contractChanged.length === 0 || specChanged
  return {pass, contractChanged, specChanged, base}
}
