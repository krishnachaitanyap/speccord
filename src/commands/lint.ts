import {Command, Args, Flags} from '@oclif/core'
import {actionLint} from '../lib/actions.js'

export default class Lint extends Command {
  static description = 'Lint feature specs: front-matter, base reference, and AC-to-test linkage.'
  static args = {
    path: Args.string({description: 'a single spec file to lint (default: all feature specs)'}),
  }
  static flags = {
    json: Flags.boolean({description: 'emit machine-readable JSON (for agents/CI)'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Lint)
    const result = await actionLint(process.cwd(), args.path)

    if (flags.json) {
      this.log(JSON.stringify(result, null, 2))
      if (!result.ok) this.exit(1)
      return
    }

    for (const f of result.files) {
      if (f.issues.length === 0) {
        this.log(`✓ ${f.file}`)
        continue
      }
      this.log(`✗ ${f.file}`)
      for (const i of f.issues) this.log(`    [${i.level}] ${i.message}`)
    }
    if (!result.ok) this.error(`${result.errors} lint error(s).`, {exit: 1})
    this.log(`\nLint passed (${result.files.length} spec(s)).`)
  }
}
