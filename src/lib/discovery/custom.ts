import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import fg from 'fast-glob'
import type {ApiOperation, TableInfo, TopicInfo} from '../spec/model.js'
import type {DiscoveryProvider, ProviderResult, SurfaceKind} from './provider.js'

// ---- Enterprise extensibility -------------------------------------------------
// Most of the value of "stack-agnostic" for a large org is being able to teach
// speccord about THEIR proprietary frameworks without forking it. Two escape
// hatches, both declared in speccord.config.yaml under `discovery`:
//
//   1. Declarative custom providers (no code): glob a set of files and pull
//      facts out with regex rules. Covers in-house annotations, custom RPC IDLs,
//      bespoke migration formats, internal auth scopes, etc.
//   2. Code plugins: point at a JS module that exports DiscoveryProvider[] for
//      anything too complex for regex.

interface MatchRule {
  match: string
  flags?: string
}
export interface CustomProviderSpec {
  name: string
  kind: SurfaceKind
  files: string[] // globs, relative to repo root
  // API operations: capture a path (and optionally method + operationId)
  operations?: MatchRule & {method?: string; methodGroup?: number; pathGroup?: number; idGroup?: number}
  // Data tables: capture a table name
  tables?: MatchRule & {nameGroup?: number}
  // Events: capture a topic/queue name
  topics?: MatchRule & {nameGroup?: number; role?: TopicInfo['role']}
  // Security: capture scope/permission strings
  scopes?: MatchRule & {group?: number}
  // Security flag: if this regex matches anywhere, mark resourceServer=true
  resourceServerWhen?: string
}

function rx(rule: MatchRule): RegExp {
  const flags = rule.flags && rule.flags.includes('g') ? rule.flags : `${rule.flags ?? ''}g`
  return new RegExp(rule.match, flags)
}

export function buildCustomProvider(spec: CustomProviderSpec): DiscoveryProvider {
  return {
    name: spec.name,
    kind: spec.kind,
    detect: async ({root}) =>
      (await fg(spec.files, {cwd: root, ignore: ['**/node_modules/**'], suppressErrors: true})).length > 0,
    discover: async ({root}) => {
      const files = await fg(spec.files, {cwd: root, absolute: true, ignore: ['**/node_modules/**'], suppressErrors: true})
      const operations: ApiOperation[] = []
      const tables: TableInfo[] = []
      const topics: TopicInfo[] = []
      const scopes = new Set<string>()
      let resourceServer = false
      const warnings: string[] = []

      for (const f of files) {
        let text: string
        try {
          text = await readFile(f, 'utf8')
        } catch {
          continue
        }
        const rel = f.replace(root, '.')
        try {
          if (spec.operations)
            for (const m of text.matchAll(rx(spec.operations))) {
              const path = m[spec.operations.pathGroup ?? 1]
              if (!path) continue
              const method =
                spec.operations.method ??
                (spec.operations.methodGroup ? (m[spec.operations.methodGroup] ?? 'get') : 'get')
              operations.push({
                method: method.toLowerCase(),
                path,
                operationId: spec.operations.idGroup ? m[spec.operations.idGroup] : undefined,
                scopes: [],
              })
            }
          if (spec.tables)
            for (const m of text.matchAll(rx(spec.tables))) {
              const name = m[spec.tables.nameGroup ?? 1]
              if (name) tables.push({name, columns: [], primaryKey: [], sourceFile: rel})
            }
          if (spec.topics)
            for (const m of text.matchAll(rx(spec.topics))) {
              const name = m[spec.topics.nameGroup ?? 1]
              if (name) topics.push({name, role: spec.topics.role ?? 'configured', source: rel})
            }
          if (spec.scopes)
            for (const m of text.matchAll(rx(spec.scopes))) {
              const s = m[spec.scopes.group ?? 1]
              if (s) scopes.add(s)
            }
          if (spec.resourceServerWhen && new RegExp(spec.resourceServerWhen).test(text)) resourceServer = true
        } catch (e) {
          warnings.push(`custom provider "${spec.name}": bad regex (${String(e)})`)
          break
        }
      }

      const result: ProviderResult = {warnings}
      if (spec.operations) result.api = {operations}
      if (spec.tables) result.data = {tables}
      if (spec.topics) result.events = {topics}
      if (spec.scopes || spec.resourceServerWhen)
        result.security = {scopes: [...scopes].sort(), resourceServer}
      return result
    },
  }
}

// Load DiscoveryProvider[] from a JS module (module.default or module.providers).
export async function loadPluginProviders(
  root: string,
  paths: string[],
): Promise<{providers: DiscoveryProvider[]; warnings: string[]}> {
  const providers: DiscoveryProvider[] = []
  const warnings: string[] = []
  for (const p of paths) {
    try {
      const url = pathToFileURL(resolve(root, p)).href
      const mod: any = await import(url)
      const exported = mod.default ?? mod.providers
      const list: DiscoveryProvider[] = Array.isArray(exported) ? exported : exported ? [exported] : []
      if (list.length === 0) warnings.push(`plugin "${p}" exported no providers`)
      providers.push(...list)
    } catch (e) {
      warnings.push(`failed to load discovery plugin "${p}": ${String(e)}`)
    }
  }
  return {providers, warnings}
}
