import {join} from 'node:path'
import {readFile, writeFile} from 'node:fs/promises'
import {Command, Args, Flags} from '@oclif/core'
import {complete, llmEnabled} from '../lib/llm/anthropic.js'
import {buildPlanPrompt, planPlaceholder, planSkeleton} from '../lib/spec/plan.js'
import {loadConstitution} from '../lib/spec/constitution.js'
import {loadFeature} from '../lib/spec/feature.js'
import {loadConfig} from '../lib/config.js'

export default class Plan extends Command {
  static description = 'Generate an implementation plan from a feature spec (grounded in the base spec + constitution).'
  static examples = ['<%= config.bin %> plan specs/features/SPEC-142-order-cancellation.md']
  static args = {path: Args.string({description: 'path to the feature spec', required: true})}
  static flags = {
    llm: Flags.boolean({description: 'use the LLM to draft the plan', default: true, allowNo: true}),
    force: Flags.boolean({description: 'overwrite an existing plan'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Plan)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)
    if (!cfg) this.error('No speccord.config.yaml found. Run `speccord init` first.')

    const feature = await loadFeature(cwd, args.path)
    if (feature.planText !== undefined && !flags.force)
      this.error(`Plan already exists at ${feature.paths.plan}. Use --force to regenerate.`)

    const title = String(feature.spec.frontMatter.title ?? feature.spec.frontMatter.id ?? 'Feature')
    const baseSpec = await readFile(join(cwd, cfg!.baseSpec), 'utf8').catch(() => '(base spec not found)')
    const constitution = (await loadConstitution(join(cwd, cfg!.constitution))) ?? '(no constitution)'

    let bodySections: string
    if (llmEnabled(flags.llm)) {
      this.log('Drafting plan with the LLM...')
      try {
        bodySections = await complete(
          buildPlanPrompt({specTitle: title, specBody: feature.spec.body, baseSpec, constitution}),
        )
      } catch (e) {
        this.warn(`LLM draft failed (${String(e)}); writing placeholder.`)
        bodySections = planPlaceholder()
      }
    } else {
      this.log('Writing deterministic plan skeleton (no LLM).')
      bodySections = planPlaceholder()
    }

    await writeFile(feature.paths.plan, planSkeleton(title, bodySections))
    this.log(`\nPlan written to ${feature.paths.plan.replace(cwd, '.')}.`)
    this.log('Next: speccord tasks ' + args.path)
  }
}
