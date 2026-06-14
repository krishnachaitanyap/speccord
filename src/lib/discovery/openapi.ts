import {readFile} from 'node:fs/promises'
import fg from 'fast-glob'
import {parse} from 'yaml'
import type {ApiOperation} from '../spec/model.js'

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options']

export interface OpenApiResult {
  file?: string
  version?: string
  operations: ApiOperation[]
  securitySchemes: string[]
  warning?: string
}

async function findOpenApiFile(root: string): Promise<string | undefined> {
  const patterns = [
    '**/openapi.{yaml,yml,json}',
    '**/*-v*.{yaml,yml,json}',
    '**/api/*.{yaml,yml,json}',
    '**/resources/**/openapi*.{yaml,yml,json}',
  ]
  const hits = await fg(patterns, {
    cwd: root,
    absolute: true,
    ignore: ['**/node_modules/**', '**/target/**', '**/build/**', '**/dist/**'],
    suppressErrors: true,
  })
  // Prefer a file that actually declares openapi/swagger.
  for (const f of hits) {
    try {
      const txt = await readFile(f, 'utf8')
      if (/^\s*(openapi|swagger)\s*:/m.test(txt) || /"(openapi|swagger)"\s*:/.test(txt)) return f
    } catch {
      /* ignore */
    }
  }
  return hits[0]
}

function scopesFromSecurity(security: unknown): string[] {
  if (!Array.isArray(security)) return []
  const scopes: string[] = []
  for (const req of security) {
    if (req && typeof req === 'object') {
      for (const v of Object.values(req as Record<string, unknown>)) {
        if (Array.isArray(v)) scopes.push(...v.map(String))
      }
    }
  }
  return [...new Set(scopes)]
}

export async function discoverOpenApi(root: string): Promise<OpenApiResult> {
  const file = await findOpenApiFile(root)
  if (!file) return {operations: [], securitySchemes: [], warning: 'no OpenAPI file found'}

  let doc: any
  try {
    const raw = await readFile(file, 'utf8')
    doc = file.endsWith('.json') ? JSON.parse(raw) : parse(raw)
  } catch (e) {
    return {file, operations: [], securitySchemes: [], warning: `failed to parse OpenAPI: ${String(e)}`}
  }

  const operations: ApiOperation[] = []
  const paths = doc?.paths ?? {}
  for (const [path, item] of Object.entries<any>(paths)) {
    if (!item || typeof item !== 'object') continue
    for (const method of HTTP_METHODS) {
      const op = item[method]
      if (!op) continue
      operations.push({
        method,
        path,
        operationId: op.operationId,
        summary: op.summary,
        scopes: scopesFromSecurity(op.security ?? doc.security),
      })
    }
  }

  const securitySchemes = Object.keys(doc?.components?.securitySchemes ?? {})
  return {file, version: doc?.info?.version, operations, securitySchemes}
}
