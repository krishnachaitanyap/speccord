import {writeFile} from 'node:fs/promises'
import {Command, Args, Flags} from '@oclif/core'
import {complete, llmEnabled} from '../lib/llm/anthropic.js'
import {buildTasksPrompt, parseTasks, tasksPlaceholder, tasksSkeleton} from '../lib/spec/tasks.js'
import {loadFeature} from '../lib/spec/feature.js'
import {loadConfig} from '../lib/config.js'

export default class Tasks extends Command {
  static description = 'Derive an ordered, dependency-aware task checklist from a feature spec and its plan.'
  static examples = ['<%= config.bin %> tasks specs/features/SPEC-142-order-cancellation.md']
  static args = {path: Args.string({description: 'path to the feature spec', required: true})}
  static flags = {
    llm: Flags.boolean({description: 'use the LLM to derive tasks', default: true, allowNo: true}),
    force: Flags.boolean({description: 'overwrite an existing tasks file'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Tasks)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)
    if (!cfg) this.error('No speccord.config.yaml found. Run `speccord init` first.')

    const feature = await loadFeature(cwd, args.path)
    if (feature.planText === undefined)
      this.error(`No plan found at ${feature.paths.plan.replace(cwd, '.')}. Run \`speccord plan ${args.path}\` first.`)
    if (feature.tasksText !== undefined && !flags.force)
      this.error(`Tasks already exist at ${feature.paths.tasks.replace(cwd, '.')}. Use --force to regenerate.`)

    const title = String(feature.spec.frontMatter.title ?? feature.spec.frontMatter.id ?? 'Feature')

    let bodySection: string
    if (llmEnabled(flags.llm)) {
      this.log('Deriving tasks with the LLM...')
      try {
        bodySection = await complete(
          buildTasksPrompt({specTitle: title, specBody: feature.spec.body, planText: feature.planText!}),
        )
      } catch (e) {
        this.warn(`LLM draft failed (${String(e)}); writing placeholder.`)
        bodySection = tasksPlaceholder()
      }
    } else {
      this.log('Writing deterministic tasks placeholder (no LLM).')
      bodySection = tasksPlaceholder()
    }

    const content = tasksSkeleton(title, bodySection)
    await writeFile(feature.paths.tasks, content)
    const count = parseTasks(content).length
    this.log(`\nTasks written to ${feature.paths.tasks.replace(cwd, '.')} (${count} task(s)).`)
    this.log('Next: speccord analyze ' + args.path + '   then   speccord implement ' + args.path)
  }
}
