import {join} from 'node:path'
import {writeFile} from 'node:fs/promises'
import {Command, Flags} from '@oclif/core'
import {input} from '@inquirer/prompts'
import {readSpec, serializeSpec} from '../../lib/spec/frontmatter.js'
import {featureFrontMatter, featureSpecBody} from '../../lib/spec/templates.js'
import {ensureDir, loadConfig} from '../../lib/config.js'

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default class FeatureNew extends Command {
  static description = 'Create a feature spec from template, pinned to the current base spec version.'
  static flags = {
    id: Flags.string({description: 'spec id, e.g. SPEC-142'}),
    title: Flags.string({char: 't', description: 'feature title'}),
    owner: Flags.string({description: 'owner', default: process.env.USER ?? 'unknown'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(FeatureNew)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)
    if (!cfg) this.error('No speccord.config.yaml found. Run `speccord init` first.')

    const id = flags.id ?? (await input({message: 'Spec id', default: 'SPEC-XXX'}))
    const title = flags.title ?? (await input({message: 'Feature title'}))

    // Pin to the current base version.
    let baseVersion = 'unknown'
    try {
      const base = await readSpec(join(cwd, cfg!.baseSpec))
      baseVersion = String(base.frontMatter.specVersion ?? base.frontMatter.baseVersion ?? 'unknown')
    } catch {
      this.warn(`Base spec not found at ${cfg!.baseSpec}; pinning baseVersion=unknown.`)
    }

    const fm = featureFrontMatter({id, title, base: cfg!.service, baseVersion, owner: flags.owner})
    const body = featureSpecBody().replace('{{title}}', title)
    const filename = `${id}-${slug(title)}.md`
    const out = join(cfg!.featuresDir, filename)

    await ensureDir(join(cwd, cfg!.featuresDir))
    await writeFile(join(cwd, out), serializeSpec({frontMatter: fm, body}))
    this.log(`Created ${out} (status: Draft, base ${cfg!.service} v${baseVersion}).`)
  }
}
