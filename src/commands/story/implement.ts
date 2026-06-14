import {join} from 'node:path'
import {readFile, writeFile} from 'node:fs/promises'
import {Command, Args, Flags} from '@oclif/core'
import {readSpec, writeSpec} from '../../lib/spec/frontmatter.js'
import {parseTasks, setTaskDone} from '../../lib/spec/tasks.js'
import {loadConstitution} from '../../lib/spec/constitution.js'
import {loadConfig, capabilityOn} from '../../lib/config.js'
import {getPersona} from '../../lib/agents.js'
import {sh} from '../../lib/run.js'
import type {StoryFrontMatter, StoryStatus} from '../../lib/spec/story.js'
import type {TaskItem} from '../../lib/spec/model.js'

async function readMaybe(p: string): Promise<string> {
  try {
    return await readFile(p, 'utf8')
  } catch {
    return ''
  }
}

export default class StoryImplement extends Command {
  static description =
    'Drive a story task-by-task with the dev persona: emit a prompt pack, or (with --execute) run the configured agent + tests and check tasks off — advancing the story through its status machine.'
  static examples = [
    '<%= config.bin %> story implement specs/stories/STORY-1-*.md',
    '<%= config.bin %> story implement specs/stories/STORY-1-*.md --execute',
  ]
  static args = {path: Args.string({description: 'path to the story file', required: true})}
  static flags = {
    execute: Flags.boolean({description: 'run the configured agentCommand + testCommand per task'}),
    task: Flags.string({description: 'only this task id, e.g. T-2'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(StoryImplement)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)
    if (!cfg) this.error('No speccord.config.yaml found. Run `speccord init` first.')
    if (!capabilityOn(cfg, 'epicsStories'))
      this.error(`The "epicsStories" capability is off at scale ${cfg!.methodology.scale}. See \`speccord capabilities\`.`)

    const path = join(cwd, args.path)
    const story = await readSpec(path)
    const fm = story.frontMatter as StoryFrontMatter

    let storyBody = story.body
    let tasks = parseTasks(storyBody)
    if (tasks.length === 0)
      this.error('This story has no parsable "## Tasks" checklist. Regenerate it with `speccord story new`.')
    if (flags.task) tasks = tasks.filter((t) => t.id === flags.task)
    const pending = tasks.filter((t) => !t.done)
    if (pending.length === 0) {
      this.log('All selected tasks are already done.')
      return
    }

    const constitution = (await loadConstitution(join(cwd, cfg!.constitution))) || '(no constitution)'
    const baseSpec = (await readMaybe(join(cwd, cfg!.baseSpec))) || '(no base spec)'
    const devSystem = getPersona('dev').system

    // The story is already context-engineered, so the prompt is mostly the story
    // itself plus the constitution and contract for guardrails.
    const mkPrompt = (t: TaskItem) =>
      `${devSystem}\n\n# Constitution\n${constitution}\n\n# Base spec (contract)\n${baseSpec}\n\n` +
      `# Story ${fm.id ?? ''}: ${fm.title ?? ''}\n${storyBody}\n\n---\n` +
      `Implement ONLY task ${t.id}: ${t.title}. ${t.files.length ? `Files: ${t.files.join(', ')}.` : ''} ` +
      `Make its acceptance-criterion tests pass; do not exceed the task scope.`

    // Prompt-pack mode (default).
    if (!flags.execute) {
      const pack =
        `# Dev prompts for ${fm.id ?? ''}: ${fm.title ?? ''}\n\n` +
        pending.map((t) => `---\n\n${mkPrompt(t)}`).join('\n\n')
      const out = path.replace(/\.md$/, '.prompts.md')
      await writeFile(out, pack)
      this.log(`Wrote ${pending.length} dev prompt(s) to ${out.replace(cwd, '.')}.`)
      this.log('Feed these to your coding agent, or configure implement.agentCommand and re-run with --execute.')
      return
    }

    // Execute mode.
    const agentCmd = cfg!.implement?.agentCommand
    const testCmd = cfg!.implement?.testCommand
    if (!agentCmd) this.error('--execute needs implement.agentCommand in speccord.config.yaml.')

    // Move the story into "In Progress" if it isn't already past it.
    if (fm.storyStatus === 'Draft' || fm.storyStatus === 'Ready' || !fm.storyStatus) {
      fm.storyStatus = 'In Progress'
      await writeSpec(path, {frontMatter: fm, body: storyBody})
    }

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
      storyBody = setTaskDone(storyBody, t.id, true)
      await writeSpec(path, {frontMatter: fm, body: storyBody})
      this.log(`  ✓ ${t.id} done${testCmd ? ' (tests green)' : ''}`)
    }

    const remaining = parseTasks(storyBody).filter((x) => !x.done).length
    if (remaining === 0) {
      ;(story.frontMatter as StoryFrontMatter).storyStatus = 'Review' as StoryStatus
      await writeSpec(path, {frontMatter: story.frontMatter, body: storyBody})
      this.log(`\nAll tasks done — story moved to Review. Next: speccord review ${args.path} --lens edge-cases`)
    } else {
      this.log(`\n${remaining} task(s) remaining.`)
    }
  }
}
