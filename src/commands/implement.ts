import {join} from 'node:path'
import {readFile, writeFile} from 'node:fs/promises'
import {Command, Args, Flags} from '@oclif/core'
import {parseTasks, setTaskDone} from '../lib/spec/tasks.js'
import {loadConstitution} from '../lib/spec/constitution.js'
import {loadFeature} from '../lib/spec/feature.js'
import {loadConfig} from '../lib/config.js'
import {sh} from '../lib/run.js'
import type {TaskItem} from '../lib/spec/model.js'

function taskPrompt(ctx: {
  task: TaskItem
  title: string
  specBody: string
  planText: string
  baseSpec: string
  constitution: string
}): string {
  return `You are implementing ONE task in an existing Spring Boot microservice.
Follow the constitution and the service contract exactly. Do not exceed the task's scope.

# Task ${ctx.task.id}: ${ctx.task.title}
${ctx.task.files.length ? `Target files: ${ctx.task.files.join(', ')}` : ''}

# Constitution (non-negotiable)
${ctx.constitution}

# Base service spec (the contract)
${ctx.baseSpec}

# Feature spec
# ${ctx.title}
${ctx.specBody}

# Implementation plan
${ctx.planText}

Implement only task ${ctx.task.id}. Make the relevant acceptance-criterion tests pass.`
}

export default class Implement extends Command {
  static description =
    'Drive implementation task-by-task: emit grounded prompts, or (with --execute) run a configured agent + test loop and check off tasks.'
  static examples = [
    '<%= config.bin %> implement specs/features/SPEC-142-*.md            # write a prompt pack',
    '<%= config.bin %> implement specs/features/SPEC-142-*.md --execute  # drive the configured agent',
  ]
  static args = {path: Args.string({description: 'path to the feature spec', required: true})}
  static flags = {
    execute: Flags.boolean({description: 'run the configured agentCommand + testCommand per task'}),
    task: Flags.string({description: 'only this task id, e.g. T-3'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Implement)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)
    if (!cfg) this.error('No speccord.config.yaml found. Run `speccord init` first.')

    const feature = await loadFeature(cwd, args.path)
    if (feature.tasksText === undefined)
      this.error(`No tasks found. Run \`speccord tasks ${args.path}\` first.`)

    const title = String(feature.spec.frontMatter.title ?? feature.spec.frontMatter.id ?? 'Feature')
    const baseSpec = await readFile(join(cwd, cfg!.baseSpec), 'utf8').catch(() => '(base spec not found)')
    const constitution = (await loadConstitution(join(cwd, cfg!.constitution))) ?? '(no constitution)'

    let tasks = parseTasks(feature.tasksText!)
    if (flags.task) tasks = tasks.filter((t) => t.id === flags.task)
    const pending = tasks.filter((t) => !t.done)
    if (pending.length === 0) {
      this.log('All selected tasks are already done.')
      return
    }

    const mkPrompt = (task: TaskItem) =>
      taskPrompt({task, title, specBody: feature.spec.body, planText: feature.planText ?? '', baseSpec, constitution})

    // Prompt-pack mode (default): write self-contained prompts for a human/agent.
    if (!flags.execute) {
      const pack =
        `# Implementation prompts for ${title}\n\n` +
        pending.map((t) => `---\n\n${mkPrompt(t)}`).join('\n\n')
      const out = feature.paths.tasks.replace(/\.tasks\.md$/, '.prompts.md')
      await writeFile(out, pack)
      this.log(`Wrote ${pending.length} task prompt(s) to ${out.replace(cwd, '.')}.`)
      this.log('Feed these to your coding agent, or configure implement.agentCommand and re-run with --execute.')
      return
    }

    // Execute mode: drive the configured agent and verify with the test command.
    const agentCmd = cfg!.implement?.agentCommand
    const testCmd = cfg!.implement?.testCommand
    if (!agentCmd) this.error('--execute needs implement.agentCommand in speccord.config.yaml.')

    let tasksText = feature.tasksText!
    for (const t of pending) {
      this.log(`\n▶ ${t.id}: ${t.title}`)
      const agentRes = await sh(agentCmd!, cwd, mkPrompt(t))
      if (agentRes.code !== 0) {
        this.warn(`agent exited ${agentRes.code} for ${t.id}; stopping.`)
        this.log(agentRes.output)
        break
      }
      if (testCmd) {
        this.log(`  running tests: ${testCmd}`)
        const testRes = await sh(testCmd, cwd)
        if (testRes.code !== 0) {
          this.warn(`tests failed for ${t.id}; leaving it unchecked and stopping.`)
          this.log(testRes.output)
          break
        }
      }
      tasksText = setTaskDone(tasksText, t.id, true)
      await writeFile(feature.paths.tasks, tasksText)
      this.log(`  ✓ ${t.id} done${testCmd ? ' (tests green)' : ''}`)
    }

    const remaining = parseTasks(tasksText).filter((t) => !t.done).length
    this.log(`\n${remaining} task(s) remaining.`)
  }
}
