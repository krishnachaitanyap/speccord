import {join} from 'node:path'
import {Command, Args, Flags} from '@oclif/core'
import {readSpec, writeSpec} from '../../lib/spec/frontmatter.js'
import {STORY_TRANSITIONS, type StoryStatus, type StoryFrontMatter} from '../../lib/spec/story.js'

export default class StoryAdvance extends Command {
  static description = 'Move a story through its status machine: Draft → Ready → In Progress → Review → Done.'
  static examples = ['<%= config.bin %> story advance specs/stories/STORY-1-*.md --to "In Progress"']
  static args = {path: Args.string({description: 'path to the story file', required: true})}
  static flags = {to: Flags.string({description: 'target status', required: true})}

  async run(): Promise<void> {
    const {args, flags} = await this.parse(StoryAdvance)
    const cwd = process.cwd()
    const path = join(cwd, args.path)
    const story = await readSpec(path)
    const fm = story.frontMatter as StoryFrontMatter

    const current = (fm.storyStatus ?? 'Draft') as StoryStatus
    const target = flags.to as StoryStatus
    const allowed = STORY_TRANSITIONS[current] ?? []
    if (!allowed.includes(target)) {
      this.error(`Illegal story transition ${current} → ${target}. Allowed: ${allowed.join(', ') || '(none)'}`)
    }

    fm.storyStatus = target
    fm.updated = new Date().toISOString().slice(0, 10)
    await writeSpec(path, story)
    this.log(`${args.path}: ${current} → ${target}`)
  }
}
