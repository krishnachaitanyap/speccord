import {basename} from 'node:path'
import type {DiscoveryReport} from '../spec/model.js'
import {discoverOpenApi} from './openapi.js'
import {discoverMigrations} from './migrations.js'
import {discoverKafka} from './kafka.js'
import {discoverSecurity} from './security.js'

export async function discover(root: string, serviceName?: string): Promise<DiscoveryReport> {
  const [api, migrations, kafka, security] = await Promise.all([
    discoverOpenApi(root),
    discoverMigrations(root),
    discoverKafka(root),
    discoverSecurity(root),
  ])

  const warnings = [api.warning, migrations.warning, kafka.warning].filter(Boolean) as string[]

  return {
    generatedAt: new Date().toISOString(),
    service: {name: serviceName ?? basename(root), root},
    api: {
      file: api.file,
      version: api.version,
      operations: api.operations,
      securitySchemes: api.securitySchemes,
    },
    data: {tables: migrations.tables, migrationFiles: migrations.files},
    events: {topics: kafka.topics},
    security,
    warnings,
  }
}
