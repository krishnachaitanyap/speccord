import {readFile} from 'node:fs/promises'
import fg from 'fast-glob'
import {parse} from 'yaml'
import type {ApiOperation, ColumnInfo, TableInfo, TopicInfo} from '../spec/model.js'
import type {DiscoveryProvider} from './provider.js'
import {parseCreateTables} from './migrations.js'

// Universal, declarative-source providers — they read the contract artifacts that
// exist regardless of language (GraphQL SDL, Protobuf, AsyncAPI, Prisma, SQL DDL),
// which is what makes discovery stack-agnostic out of the box. Each runs only
// when its file type is present.

const IGNORE = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/target/**', '**/vendor/**']

async function files(root: string, globs: string[]): Promise<string[]> {
  return fg(globs, {cwd: root, absolute: true, ignore: IGNORE, suppressErrors: true})
}
async function present(root: string, globs: string[]): Promise<boolean> {
  return (await fg(globs, {cwd: root, ignore: IGNORE, suppressErrors: true})).length > 0
}

// ---- GraphQL SDL ----
const GQL = ['**/*.graphql', '**/*.gql']
export const graphqlProvider: DiscoveryProvider = {
  name: 'graphql',
  kind: 'api',
  detect: ({root}) => present(root, GQL),
  discover: async ({root}) => {
    const ops: ApiOperation[] = []
    for (const f of await files(root, GQL)) {
      let txt = ''
      try {
        txt = await readFile(f, 'utf8')
      } catch {
        continue
      }
      for (const op of ['Query', 'Mutation', 'Subscription']) {
        for (const block of txt.matchAll(new RegExp(`type\\s+${op}\\s*\\{([\\s\\S]*?)\\}`, 'g'))) {
          for (const line of block[1].split('\n')) {
            const m = line.match(/^\s*(\w+)\s*[(:]/)
            if (m) ops.push({method: op.toLowerCase(), path: m[1], scopes: []})
          }
        }
      }
    }
    return {api: {operations: ops}, warnings: ops.length ? [] : ['no GraphQL operations found']}
  },
}

// ---- Protobuf ----
const PROTO = ['**/*.proto']
export const protobufProvider: DiscoveryProvider = {
  name: 'protobuf',
  kind: 'api',
  detect: ({root}) => present(root, PROTO),
  discover: async ({root}) => {
    const ops: ApiOperation[] = []
    for (const f of await files(root, PROTO)) {
      let txt = ''
      try {
        txt = await readFile(f, 'utf8')
      } catch {
        continue
      }
      for (const svc of txt.matchAll(/service\s+(\w+)\s*\{([\s\S]*?)\}/g))
        for (const rpc of svc[2].matchAll(/rpc\s+(\w+)\s*\(/g))
          ops.push({method: 'rpc', path: `${svc[1]}/${rpc[1]}`, operationId: rpc[1], scopes: []})
    }
    return {api: {operations: ops}, warnings: ops.length ? [] : ['no gRPC methods found']}
  },
}

// ---- AsyncAPI ----
const ASYNC = ['**/asyncapi*.{yaml,yml,json}']
export const asyncapiProvider: DiscoveryProvider = {
  name: 'asyncapi',
  kind: 'events',
  detect: ({root}) => present(root, ASYNC),
  discover: async ({root}) => {
    const topics: TopicInfo[] = []
    for (const f of await files(root, ASYNC)) {
      let doc: any
      try {
        const raw = await readFile(f, 'utf8')
        doc = f.endsWith('.json') ? JSON.parse(raw) : parse(raw)
      } catch {
        continue
      }
      const rel = f.replace(root, '.')
      for (const [name, ch] of Object.entries<any>(doc?.channels ?? {})) {
        const topic = ch?.address ?? name // v3 uses address; v2 uses the key
        const role: TopicInfo['role'] = ch?.subscribe ? 'produces' : ch?.publish ? 'consumes' : 'configured'
        topics.push({name: String(topic), role, source: rel})
      }
    }
    return {events: {topics}, warnings: topics.length ? [] : ['no AsyncAPI channels found']}
  },
}

// ---- Prisma schema ----
const PRISMA = ['**/schema.prisma']
export const prismaProvider: DiscoveryProvider = {
  name: 'prisma',
  kind: 'data',
  detect: ({root}) => present(root, PRISMA),
  discover: async ({root}) => {
    const tables: TableInfo[] = []
    for (const f of await files(root, PRISMA)) {
      let txt = ''
      try {
        txt = await readFile(f, 'utf8')
      } catch {
        continue
      }
      const rel = f.replace(root, '.')
      for (const model of txt.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\}/g)) {
        const columns: ColumnInfo[] = []
        const primaryKey: string[] = []
        for (const line of model[2].split('\n')) {
          const s = line.trim()
          if (!s || s.startsWith('//') || s.startsWith('@@')) continue
          const m = s.match(/^(\w+)\s+([\w[\]?.]+)/)
          if (!m) continue
          if (/@id\b/.test(s)) primaryKey.push(m[1])
          columns.push({name: m[1], type: m[2].toLowerCase(), nullable: m[2].includes('?')})
        }
        tables.push({name: model[1], columns, primaryKey, sourceFile: rel})
      }
    }
    return {data: {tables}, warnings: tables.length ? [] : ['no Prisma models found']}
  },
}

// ---- Generic SQL DDL (schema files outside the migration dirs) ----
const DDL = ['**/schema.sql', '**/*.ddl.sql', '**/sql/**/*.sql', '**/ddl/**/*.sql']
export const sqlDdlProvider: DiscoveryProvider = {
  name: 'sql-ddl',
  kind: 'data',
  detect: ({root}) => present(root, DDL),
  discover: async ({root}) => {
    const byName = new Map<string, TableInfo>()
    for (const f of await files(root, DDL)) {
      try {
        const sql = await readFile(f, 'utf8')
        for (const t of parseCreateTables(sql, f.replace(root, '.'))) byName.set(t.name, t)
      } catch {
        /* ignore */
      }
    }
    return {data: {tables: [...byName.values()]}}
  },
}

export const UNIVERSAL_PROVIDERS: DiscoveryProvider[] = [
  graphqlProvider,
  protobufProvider,
  asyncapiProvider,
  prismaProvider,
  sqlDdlProvider,
]
