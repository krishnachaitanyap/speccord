import {Command, Flags} from '@oclif/core'
import {actionStatus} from '../lib/actions.js'

export default class Status extends Command {
  static description = 'List all specs with their lifecycle status.'
  static flags = {
    status: Flags.string({char: 's', description: 'filter by status, e.g. "In Review"'}),
    json: Flags.boolean({description: 'emit machine-readable JSON (for agents/CI)'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Status)
    let rows = await actionStatus(process.cwd())
    if (flags.status) rows = rows.filter((r) => r.status === flags.status)

    if (flags.json) {
      this.log(JSON.stringify(rows, null, 2))
      return
    }

    if (rows.length === 0) {
      this.log('No specs found.')
      return
    }
    const pad = (s: string, n: number) => s.padEnd(n)
    this.log(`${pad('ID', 16)} ${pad('STATUS', 18)} ${pad('BASE', 8)} FILE`)
    for (const r of rows) this.log(`${pad(r.id, 16)} ${pad(r.status, 18)} ${pad(r.base, 8)} ${r.file}`)
  }
}
