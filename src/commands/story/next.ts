import {Command} from '@oclif/core'
import fg from 'fast-glob'
import {readSpec} from '../../lib/spec/frontmatter.js'
import {loadConfig} from '../../lib/config.js'
import type {StoryFrontMatter} from '../../lib/spec/story.js'

export default class StoryNext extends Command {
  static description = 'Show the next story to work on (lowest-id story not yet Done).'

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
    const byId = files
      .map((f) => ({f, n: Number(f.match(/STORY-(\d+)/)?.[1] ?? 0)}))
      .sort((a, b) => a.n - b.n)

    for (const {f} of byId) {
      const {frontMatter} = await readSpec(f)
      const fm = frontMatter as StoryFrontMatter
      if ((fm.storyStatus ?? 'Draft') !== 'Done') {
        this.log(`Next: ${fm.id} — ${fm.title}  [${fm.storyStatus ?? 'Draft'}]`)
        this.log(`  ${f.replace(cwd, '.')}`)
        this.log('\nWork it: speccord story advance <file> --to "In Progress"  then  speccord implement / agent dev')
        return
      }
    }
    this.log(files.length ? 'All stories are Done. 🎉' : 'No stories yet.')
  }
}
