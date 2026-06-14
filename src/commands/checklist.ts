import {writeFile} from 'node:fs/promises'
import {Command, Args, Flags} from '@oclif/core'
import {complete, llmEnabled} from '../lib/llm/anthropic.js'
import {buildChecklistPrompt, checklistComplete, checklistSkeleton, parseExtraItems} from '../lib/spec/checklist.js'
import {loadFeature} from '../lib/spec/feature.js'
import {loadConfig} from '../lib/config.js'

export default class Checklist extends Command {
  static description = 'Generate (or check) a spec-readiness quality checklist for a feature spec.'
  static examples = [
    '<%= config.bin %> checklist specs/features/SPEC-142-order-cancellation.md',
    '<%= config.bin %> checklist specs/features/SPEC-142-*.md --check',
  ]
  static args = {path: Args.string({description: 'path to the feature spec', required: true})}
  static flags = {
    llm: Flags.boolean({description: 'use the LLM to add spec-specific items', default: true, allowNo: true}),
    check: Flags.boolean({description: 'verify the existing checklist is complete (exit 1 if not)'}),
    force: Flags.boolean({description: 'overwrite an existing checklist'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Checklist)
    const cwd = process.cwd()
    await loadConfig(cwd)
    const feature = await loadFeature(cwd, args.path)
    const rel = feature.paths.checklist.replace(cwd, '.')

    if (flags.check) {
      if (feature.checklistText === undefined) this.error(`No checklist at ${rel}. Generate one first.`)
      if (checklistComplete(feature.checklistText!)) {
        this.log(`✓ Checklist complete (${rel}).`)
        return
      }
      this.error(`Checklist has unchecked items (${rel}).`, {exit: 1})
    }

    if (feature.checklistText !== undefined && !flags.force)
      this.error(`Checklist already exists at ${rel}. Use --force to regenerate, or --check to verify it.`)

    const title = String(feature.spec.frontMatter.title ?? feature.spec.frontMatter.id ?? 'Feature')
    let extra: string[] = []
    if (llmEnabled(flags.llm)) {
      this.log('Adding spec-specific checklist items with the LLM...')
      try {
        extra = parseExtraItems(await complete(buildChecklistPrompt({specTitle: title, specBody: feature.spec.body})))
      } catch (e) {
        this.warn(`LLM augmentation failed: ${String(e)}`)
      }
    }

    await writeFile(feature.paths.checklist, checklistSkeleton(title, extra))
    this.log(`Checklist written to ${rel} (${10 + extra.length} items). Check the boxes as you satisfy them.`)
  }
}
