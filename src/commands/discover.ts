import {join} from 'node:path'
import {writeFile} from 'node:fs/promises'
import {Command, Flags} from '@oclif/core'
import {discover} from '../lib/discovery/index.js'
import {REPORT_PATH, SPECCORD_DIR, ensureDir, loadConfig} from '../lib/config.js'

export {REPORT_PATH}

export default class Discover extends Command {
  static description = 'Scan a brownfield service (OpenAPI, DB migrations, Kafka, security) and write a discovery report.'
  static flags = {
    root: Flags.string({char: 'r', description: 'repo root to scan', default: '.'}),
    service: Flags.string({char: 's', description: 'service name override'}),
    json: Flags.boolean({description: 'print the full report as JSON'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Discover)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)
    const report = await discover(flags.root, flags.service ?? cfg?.service)

    await ensureDir(join(cwd, SPECCORD_DIR))
    await writeFile(join(cwd, REPORT_PATH), JSON.stringify(report, null, 2))

    if (flags.json) {
      this.log(JSON.stringify(report, null, 2))
      return
    }

    this.log(`Discovered: ${report.service.name}`)
    this.log(`  API:      ${report.api.operations.length} operations (${report.api.file ?? 'no spec file'})`)
    this.log(`  Data:     ${report.data.tables.length} tables across ${report.data.migrationFiles.length} migrations`)
    this.log(`  Events:   ${report.events.topics.length} Kafka topics`)
    this.log(`  Security: resource-server=${report.security.resourceServer}, scopes=[${report.security.scopes.join(', ')}]`)
    if (report.warnings.length) {
      this.log('\nWarnings:')
      for (const w of report.warnings) this.log(`  - ${w}`)
    }
    this.log(`\nReport written to ${REPORT_PATH}. Next: speccord base draft`)
  }
}
