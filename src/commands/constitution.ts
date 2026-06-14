import {join} from 'node:path'
import {readFile, writeFile} from 'node:fs/promises'
import {Command, Flags} from '@oclif/core'
import {constitutionTemplate} from '../lib/spec/constitution.js'
import {ensureDir, loadConfig} from '../lib/config.js'

export default class Constitution extends Command {
  static description = 'Create or show the project constitution — the non-negotiable principles plans are checked against.'
  static examples = ['<%= config.bin %> constitution', '<%= config.bin %> constitution --show']
  static flags = {
    show: Flags.boolean({description: 'print the current constitution instead of creating one'}),
    force: Flags.boolean({description: 'overwrite an existing constitution'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Constitution)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)
    if (!cfg) this.error('No speccord.config.yaml found. Run `speccord init` first.')
    const path = join(cwd, cfg!.constitution)

    if (flags.show) {
      try {
        this.log(await readFile(path, 'utf8'))
      } catch {
        this.error(`No constitution at ${cfg!.constitution}. Run \`speccord constitution\` to create one.`)
      }
      return
    }

    let exists = false
    try {
      await readFile(path, 'utf8')
      exists = true
    } catch {
      /* not present */
    }
    if (exists && !flags.force) {
      this.error(`${cfg!.constitution} already exists. Use --force to overwrite, or --show to view it.`)
    }

    await ensureDir(join(path, '..'))
    await writeFile(path, constitutionTemplate(cfg!.service))
    this.log(`Wrote ${cfg!.constitution}.`)
    this.log('Edit the principles, then they will be enforced by `speccord plan` and `speccord analyze`.')
  }
}
