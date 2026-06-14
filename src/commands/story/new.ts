import {join} from 'node:path'
import {readFile, writeFile} from 'node:fs/promises'
import {Command, Flags} from '@oclif/core'
import {input} from '@inquirer/prompts'
import fg from 'fast-glob'
import {runPersona} from '../../lib/agents.js'
import {serializeSpec} from '../../lib/spec/frontmatter.js'
import {storyFrontMatter, storyPlaceholder, storySkeleton, STORY_TASK} from '../../lib/spec/story.js'
import {parseEpics} from '../../lib/spec/prd.js'
import {ensureDir, loadConfig, capabilityOn} from '../../lib/config.js'

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
async function readMaybe(p: string): Promise<string> {
  try {
    return await readFile(p, 'utf8')
  } catch {
    return ''
  }
}

export default class StoryNew extends Command {
  static description = 'IMPLEMENTATION: shard an epic/feature into a self-contained, context-engineered story (SM persona).'
  static examples = ['<%= config.bin %> story new --epic EPIC-1 --title "Issue a gift card"']
  static flags = {
    title: Flags.string({char: 't', description: 'story title'}),
    epic: Flags.string({char: 'e', description: 'epic id from the PRD, e.g. EPIC-1'}),
    feature: Flags.string({char: 'f', description: 'feature spec path to derive the story from'}),
    llm: Flags.boolean({description: 'use the LLM', default: true, allowNo: true}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(StoryNew)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)
    if (!cfg) this.error('No speccord.config.yaml found. Run `speccord init` first.')
    if (!capabilityOn(cfg, 'epicsStories'))
      this.error(
        `The "epicsStories" capability is off at scale ${cfg!.methodology.scale}. ` +
          'Enable it (capabilities.epicsStories: true) or raise the scale. See `speccord capabilities`.',
      )

    const title = flags.title ?? (await input({message: 'Story title'}))
    if (!title.trim()) this.error('A title is required.')

    // Assemble the context the SM embeds into the story.
    const baseSpec = await readMaybe(join(cwd, cfg!.baseSpec))
    const constitution = await readMaybe(join(cwd, cfg!.constitution))
    const prd = await readMaybe(join(cwd, cfg!.prdPath))
    const feature = flags.feature ? await readMaybe(join(cwd, flags.feature)) : ''
    let epicLine = ''
    if (flags.epic && prd) {
      const e = parseEpics(prd).find((x) => x.id === flags.epic)
      if (e) epicLine = `${e.id}: ${e.title}`
    }

    const context = [
      epicLine ? `## Target epic\n${epicLine}` : '',
      `## Story to write\n${title}`,
      constitution ? `## Constitution\n${constitution}` : '',
      baseSpec ? `## Base spec (technical contract)\n${baseSpec}` : '',
      feature ? `## Parent feature spec\n${feature}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    const body = flags.llm
      ? await runPersona({role: 'sm', task: STORY_TASK, context, useLlm: true, maxTokens: 1800})
      : storyPlaceholder()

    // Allocate the next STORY-n id.
    await ensureDir(join(cwd, cfg!.storiesDir))
    const existing = await fg(['STORY-*.md'], {
      cwd: join(cwd, cfg!.storiesDir),
      ignore: ['**/*.prompts.md'],
      suppressErrors: true,
    })
    const maxN = existing.reduce((m, f) => Math.max(m, Number(f.match(/STORY-(\d+)/)?.[1] ?? 0)), 0)
    const id = `STORY-${maxN + 1}`

    const fm = storyFrontMatter({id, title, epic: flags.epic, feature: flags.feature})
    const out = join(cfg!.storiesDir, `${id}-${slug(title)}.md`)
    await writeFile(join(cwd, out), serializeSpec({frontMatter: fm, body: storySkeleton(`${id}: ${title}`, body)}))
    this.log(`Created ${out} (${id}, status: Draft${flags.epic ? `, ${flags.epic}` : ''}).`)
    this.log('Next: speccord story advance ' + out + ' --to Ready   then   speccord implement / agent dev')
  }
}
