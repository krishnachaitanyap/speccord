import {join} from 'node:path'
import {writeFile, readFile} from 'node:fs/promises'
import {Command, Flags} from '@oclif/core'
import {input} from '@inquirer/prompts'
import {draftBaseSectionsFromIntent} from '../../lib/llm/anthropic.js'
import {baseSpecBody} from '../../lib/spec/templates.js'
import {serializeSpec} from '../../lib/spec/frontmatter.js'
import {emptyDiscoveryReport, type FrontMatter} from '../../lib/spec/model.js'
import {BASELINE_PATH, SPECCORD_DIR, ensureDir, loadConfig} from '../../lib/config.js'

export default class BaseNew extends Command {
  static description =
    'GREENFIELD: author a base spec from a product intent (no code to discover). The contract surface starts empty and grows as features are implemented.'
  static examples = [
    '<%= config.bin %> base new --intent "A service that issues and redeems gift cards"',
    '<%= config.bin %> base new --service payments --no-llm',
  ]
  static flags = {
    service: Flags.string({char: 's', description: 'service name (defaults to config / cwd)'}),
    intent: Flags.string({char: 'i', description: 'one-paragraph product intent for the new service'}),
    llm: Flags.boolean({description: 'use the LLM to draft target prose', default: true, allowNo: true}),
    out: Flags.string({char: 'o', description: 'output path for the base spec'}),
    force: Flags.boolean({description: 'overwrite an existing base spec'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BaseNew)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)
    const service = flags.service ?? cfg?.service ?? 'service'

    const out = flags.out ?? cfg?.baseSpec ?? `specs/base/${service}.md`
    const outAbs = join(cwd, out)
    if (!flags.force) {
      try {
        await readFile(outAbs, 'utf8')
        this.error(`Base spec already exists at ${out}. Use --force to overwrite.`)
      } catch {
        /* good: doesn't exist */
      }
    }

    const intent =
      flags.intent ??
      (await input({message: 'Describe the new service (one paragraph: what it owns, who calls it, why)'}))
    if (!intent.trim()) this.error('An intent is required to draft a greenfield base spec.')

    this.log(flags.llm ? 'Drafting the target spec with the LLM...' : 'Generating with deterministic placeholders...')
    const report = emptyDiscoveryReport(service, new Date().toISOString())
    const prose = await draftBaseSectionsFromIntent(intent, {useLlm: flags.llm})
    const body = baseSpecBody(report, prose)
    const fm: FrontMatter = {
      service,
      status: 'Draft',
      specVersion: '0.1',
      mode: 'greenfield',
      generatedBy: 'speccord',
      generatedAt: report.generatedAt,
    }
    await ensureDir(join(outAbs, '..'))
    await writeFile(outAbs, serializeSpec({frontMatter: fm, body}))

    // Snapshot an empty baseline. As the service is built and you run
    // `speccord discover`, `speccord conform --update-baseline` accepts the real
    // surface — at which point drift detection becomes meaningful.
    await ensureDir(join(cwd, SPECCORD_DIR))
    await writeFile(join(cwd, BASELINE_PATH), JSON.stringify(report, null, 2))

    this.log(`\nBase spec written to ${out} (status: Draft, mode: greenfield).`)
    this.log('The API / persistence / eventing fact tables are empty — fill them via features.')
    this.log('Next: speccord constitution   then   speccord feature new ...')
  }
}
