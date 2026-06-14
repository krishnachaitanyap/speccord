import {Command, Flags} from '@oclif/core'
import {actionGate} from '../lib/actions.js'

export default class Gate extends Command {
  static description =
    'CI guard: fail if a contract-surface file changed without a spec file changing in the same diff.'
  static flags = {
    base: Flags.string({description: 'git ref to diff against', default: 'origin/main'}),
    json: Flags.boolean({description: 'emit machine-readable JSON (for agents/CI)'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Gate)
    const result = await actionGate(process.cwd(), flags.base)

    if (flags.json) {
      this.log(JSON.stringify(result, null, 2))
      if (!result.pass) this.exit(1)
      return
    }

    if (result.error) this.error(result.error)
    if (result.contractChanged.length === 0) {
      this.log('Gate OK: no contract-surface files changed.')
      return
    }
    this.log('Contract-surface files changed:')
    for (const f of result.contractChanged) this.log(`  - ${f}`)
    if (!result.pass) {
      this.error(
        'Gate FAILED: the contract surface changed but no spec was updated in the same change. ' +
          'Update the base spec / fragment.',
        {exit: 1},
      )
    }
    this.log('Gate OK: a spec was updated alongside the contract change.')
  }
}
