import {discoverOpenApi} from './openapi.js'
import {discoverMigrations} from './migrations.js'
import {discoverKafka} from './kafka.js'
import {discoverSecurity} from './security.js'
import type {DiscoveryProvider} from './provider.js'

// The original parsers, wrapped as providers. They self-handle "source absent"
// (returning a warning), so they stay applicable everywhere — exactly preserving
// today's behavior. Each is independently replaceable/disable-able by name.

export const openapiProvider: DiscoveryProvider = {
  name: 'openapi',
  kind: 'api',
  detect: async () => true,
  discover: async ({root}) => {
    const r = await discoverOpenApi(root)
    return {
      api: {file: r.file, version: r.version, operations: r.operations, securitySchemes: r.securitySchemes},
      warnings: r.warning ? [r.warning] : [],
    }
  },
}

export const migrationsProvider: DiscoveryProvider = {
  name: 'sql-migrations',
  kind: 'data',
  detect: async () => true,
  discover: async ({root}) => {
    const r = await discoverMigrations(root)
    return {data: {tables: r.tables, migrationFiles: r.files}, warnings: r.warning ? [r.warning] : []}
  },
}

export const kafkaProvider: DiscoveryProvider = {
  name: 'kafka',
  kind: 'events',
  detect: async () => true,
  discover: async ({root}) => {
    const r = await discoverKafka(root)
    return {events: {topics: r.topics}, warnings: r.warning ? [r.warning] : []}
  },
}

export const securityProvider: DiscoveryProvider = {
  name: 'spring-security',
  kind: 'security',
  detect: async () => true,
  discover: async ({root}) => ({security: await discoverSecurity(root)}),
}

export const BUILTIN_PROVIDERS: DiscoveryProvider[] = [
  openapiProvider,
  migrationsProvider,
  kafkaProvider,
  securityProvider,
]
