import {join} from 'node:path'
import {readFile, writeFile} from 'node:fs/promises'
import {Command, Flags} from '@oclif/core'
import {runPersona} from '../lib/agents.js'
import {llmEnabled} from '../lib/llm/anthropic.js'
import {prdPlaceholder, prdSkeleton, parseEpics, PRD_SECTIONS} from '../lib/spec/prd.js'
import {ensureDir, loadConfig, capabilityOn} from '../lib/config.js'

async function readMaybe(p: string): Promise<string> {
  try {
    return await readFile(p, 'utf8')
  } catch {
    return ''
  }
}

export default class Prd extends Command {
  static description = 'PLANNING: create or validate the Product Requirements Document with prioritized epics (PM persona).'
  static examples = ['<%= config.bin %> prd', '<%= config.bin %> prd --validate']
  static flags = {
    out: Flags.string({char: 'o', description: 'PRD path (defaults to config prdPath)'}),
    validate: Flags.boolean({description: 'review an existing PRD for gaps instead of creating one'}),
    llm: Flags.boolean({description: 'use the LLM', default: true, allowNo: true}),
    force: Flags.boolean({description: 'overwrite an existing PRD'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Prd)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)
    if (cfg && !capabilityOn(cfg, 'prd'))
      this.error(
        `The "prd" capability is off at scale ${cfg.methodology.scale}. ` +
          'Enable it (capabilities.prd: true) or raise the scale. See `speccord capabilities`.',
      )

    const out = flags.out ?? cfg?.prdPath ?? 'specs/prd.md'
    const outAbs = join(cwd, out)

    if (flags.validate) {
      const prd = await readMaybe(outAbs)
      if (!prd) this.error(`No PRD at ${out}.`)
      const review = await runPersona({
        role: 'po',
        task: 'Validate this PRD: missing success metrics, fuzzy scope, epics that are too big or unprioritized, and open questions. List concrete fixes.',
        context: `## PRD\n${prd}`,
        useLlm: flags.llm,
      })
      this.log(review)
      const epics = parseEpics(prd)
      this.log(`\nParsed ${epics.length} epic(s): ${epics.map((e) => e.id).join(', ') || '(none)'}`)
      return
    }

    if (!flags.force) {
      try {
        await readFile(outAbs, 'utf8')
        this.error(`${out} exists. Use --force to overwrite, or --validate to review it.`)
      } catch {
        /* good */
      }
    }

    const brief = await readMaybe(join(cwd, 'specs/brief.md'))
    const baseSpec = cfg ? await readMaybe(join(cwd, cfg.baseSpec)) : ''
    const product = cfg?.service ?? 'product'

    let body: string
    if (llmEnabled(flags.llm)) {
      this.log('Drafting the PRD with the PM persona...')
      body = await runPersona({
        role: 'pm',
        task: `Write the PRD.\n${PRD_SECTIONS}`,
        context:
          (brief ? `## Product brief\n${brief}\n\n` : '') +
          (baseSpec ? `## Existing base spec (technical contract)\n${baseSpec}` : '## (no base spec yet)'),
        useLlm: true,
        maxTokens: 2000,
      })
    } else {
      this.log('Writing deterministic PRD skeleton (no LLM).')
      body = prdPlaceholder()
    }

    await ensureDir(join(outAbs, '..'))
    await writeFile(outAbs, prdSkeleton(product, body))
    const epics = parseEpics(await readMaybe(outAbs))
    this.log(`\nPRD written to ${out} (${epics.length} epic(s) parsed).`)
    this.log('Next: speccord story new --epic EPIC-1 --title "..."   (shard epics into stories)')
  }
}
