import type {ApiOperation, DiscoveryReport, TableInfo, TopicInfo} from '../spec/model.js'

// The contract surface is universal; only the SOURCES that reveal it differ per
// stack. A DiscoveryProvider knows how to detect one kind of source and emit
// the facts it finds. The registry runs all applicable providers and merges
// their results into one normalized DiscoveryReport — so the rest of speccord
// (gates, conform, lifecycle) stays completely stack-agnostic.

export type SurfaceKind = 'api' | 'data' | 'events' | 'security'

export interface Stack {
  languages: string[] // e.g. ['java','node']
  markers: string[] // marker files found, e.g. ['pom.xml','package.json']
}

export interface DiscoveryContext {
  root: string
  stack: Stack
}

// What a provider returns — any subset of the surface. Merged additively.
export interface ProviderResult {
  api?: {file?: string; version?: string; operations?: ApiOperation[]; securitySchemes?: string[]}
  data?: {tables?: TableInfo[]; migrationFiles?: string[]}
  events?: {topics?: TopicInfo[]}
  security?: {resourceServer?: boolean; jwksConfigured?: boolean; scopes?: string[]; annotations?: string[]}
  warnings?: string[]
}

export interface DiscoveryProvider {
  name: string
  kind: SurfaceKind
  // Is this provider applicable to the repo? (cheap check; full work in discover)
  detect(ctx: DiscoveryContext): Promise<boolean>
  discover(ctx: DiscoveryContext): Promise<ProviderResult>
}

export function emptyReport(serviceName: string, root: string, stack: Stack): DiscoveryReport {
  return {
    generatedAt: new Date().toISOString(),
    service: {name: serviceName, root},
    stack: stack.languages,
    api: {operations: [], securitySchemes: []},
    data: {tables: [], migrationFiles: []},
    events: {topics: []},
    security: {resourceServer: false, jwksConfigured: false, scopes: [], annotations: []},
    warnings: [],
  }
}

// Merge a provider result into the accumulating report. Declarative-source facts
// (e.g. an OpenAPI file) should win over code-heuristic facts; providers are run
// in priority order and the FIRST file/version seen wins, while collections are
// unioned and de-duplicated.
export function mergeInto(report: DiscoveryReport, r: ProviderResult): void {
  if (r.api) {
    if (!report.api.file && r.api.file) report.api.file = r.api.file
    if (!report.api.version && r.api.version) report.api.version = r.api.version
    if (r.api.operations) {
      const seen = new Set(report.api.operations.map((o) => `${o.method} ${o.path}`))
      for (const op of r.api.operations)
        if (!seen.has(`${op.method} ${op.path}`)) report.api.operations.push(op)
    }
    if (r.api.securitySchemes)
      report.api.securitySchemes = [...new Set([...report.api.securitySchemes, ...r.api.securitySchemes])]
  }
  if (r.data) {
    if (r.data.tables) {
      const seen = new Set(report.data.tables.map((t) => t.name))
      for (const t of r.data.tables) if (!seen.has(t.name)) report.data.tables.push(t)
    }
    if (r.data.migrationFiles)
      report.data.migrationFiles = [...new Set([...report.data.migrationFiles, ...r.data.migrationFiles])]
  }
  if (r.events?.topics) {
    const seen = new Set(report.events.topics.map((t) => `${t.name}:${t.role}`))
    for (const t of r.events.topics) if (!seen.has(`${t.name}:${t.role}`)) report.events.topics.push(t)
  }
  if (r.security) {
    report.security.resourceServer ||= Boolean(r.security.resourceServer)
    report.security.jwksConfigured ||= Boolean(r.security.jwksConfigured)
    if (r.security.scopes)
      report.security.scopes = [...new Set([...report.security.scopes, ...r.security.scopes])].sort()
    if (r.security.annotations)
      report.security.annotations = [...new Set([...report.security.annotations, ...r.security.annotations])].slice(0, 50)
  }
  if (r.warnings) report.warnings.push(...r.warnings)
}
