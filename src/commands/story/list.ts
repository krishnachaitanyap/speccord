import {Command} from '@oclif/core'
import fg from 'fast-glob'
import {readSpec} from '../../lib/spec/frontmatter.js'
import {loadConfig} from '../../lib/config.js'
import type {StoryFrontMatter} from '../../lib/spec/story.js'

export default class StoryList extends Command {
  static description = 'List all stories with their status, epic, and parent feature (sprint board).'

  async run(): Promise<void> {
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)
    const dir = cfg?.storiesDir ?? 'specs/stories'

    const files = await fg(['STORY-*.md'], {
      cwd: `${cwd}/${dir}`,
      absolute: true,
      ignore: ['**/*.prompts.md'],
      suppressErrors: true,
    })
    if (files.length === 0) {
      this.log('No stories yet. Create one with: speccord story new --title "..."')
      return
    }

    const rows: {id: string; status: string; epic: string; title: string}[] = []
    for (const f of files.sort()) {
      const {frontMatter} = await readSpec(f)
      const fm = frontMatter as StoryFrontMatter
      rows.push({
        id: String(fm.id ?? '?'),
        status: String(fm.storyStatus ?? 'Draft'),
        epic: String(fm.epic ?? '—'),
        title: String(fm.title ?? ''),
      })
    }
    const pad = (s: string, n: number) => s.padEnd(n)
    this.log(`${pad('ID', 10)} ${pad('STATUS', 12)} ${pad('EPIC', 8)} TITLE`)
    for (const r of rows) this.log(`${pad(r.id, 10)} ${pad(r.status, 12)} ${pad(r.epic, 8)} ${r.title}`)
    const done = rows.filter((r) => r.status === 'Done').length
    this.log(`\n${done}/${rows.length} done.`)
  }
}
