import {Command, Args, Flags} from '@oclif/core'
import {actionAnalyze} from '../lib/actions.js'

export default class Analyze extends Command {
  static description =
    'Cross-check a feature spec, its plan, tasks, and the constitution for gaps and disagreements (deterministic).'
  static examples = ['<%= config.bin %> analyze specs/features/SPEC-142-order-cancellation.md']
  static args = {path: Args.string({description: 'path to the feature spec', required: true})}
  static flags = {
    json: Flags.boolean({description: 'emit machine-readable JSON (for agents/CI)'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Analyze)
    const result = await actionAnalyze(process.cwd(), args.path)

    if (flags.json) {
      this.log(JSON.stringify(result, null, 2))
      if (!result.ok) this.exit(1)
      return
    }

    if (result.findings.length === 0) {
      this.log('✓ Artifacts are consistent. No issues found.')
      return
    }
    const order = {error: 0, warn: 1, info: 2} as const
    for (const f of [...result.findings].sort((a, b) => order[a.level] - order[b.level]))
      this.log(`  [${f.level}] (${f.area}) ${f.message}`)
    this.log(`\n${result.errors} error(s), ${result.warnings} warning(s).`)
    if (!result.ok) this.error('Analysis found blocking issues.', {exit: 1})
  }
}
