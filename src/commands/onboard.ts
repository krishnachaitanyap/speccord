import {join} from 'node:path'
import {writeFile} from 'node:fs/promises'
import {Command, Flags} from '@oclif/core'
import {ensureDir, loadConfig} from '../lib/config.js'
import {gather, listStrategies} from '../lib/knowledge/index.js'
import {runPersona} from '../lib/agents.js'
import type {Role} from '../lib/methodology.js'

// What each target drafts, and who drafts it.
const TARGETS: Record<string, {role: Role; task: string; out: string; title: string}> = {
  brief: {
    role: 'analyst',
    title: 'Product brief',
    out: 'specs/onboarding/brief.draft.md',
    task: 'Write a product brief from this material: problem, users, goals & success metrics, constraints, risks, and open questions (mark unknowns with [NEEDS CLARIFICATION: ...]).',
  },
  prd: {
    role: 'pm',
    title: 'PRD',
    out: 'specs/onboarding/prd.draft.md',
    task: 'Write a PRD from this material: problem & goals, users, scope (in/out), a prioritized epic list (EPIC-1, EPIC-2, …), and risks/open questions.',
  },
  constitution: {
    role: 'architect',
    title: 'Constitution',
    out: 'specs/onboarding/constitution.draft.md',
    task: 'Extract the non-negotiable engineering principles implied by this material as a numbered list P-1, P-2, … Each: a short title and one or two sentences. Do not invent policy not supported by the text.',
  },
  base: {
    role: 'architect',
    title: 'Base spec (prose)',
    out: 'specs/onboarding/base.draft.md',
    task: 'Draft the prose sections of a service base spec from this material: purpose & responsibilities, domain/state notes, security model, NFRs/SLOs, observability. Do NOT invent API endpoints, tables, or topics — those come from `speccord discover`. Mark gaps with TODO.',
  },
  feature: {
    role: 'pm',
    title: 'Feature spec',
    out: 'specs/onboarding/feature.draft.md',
    task: 'Draft a feature spec from this material: context, objective, scope, functional requirements (FR-n), and acceptance criteria as AC-n in Given/When/Then form. Mark unknowns with [NEEDS CLARIFICATION: ...].',
  },
}

export default class Onboard extends Command {
  static description =
    'Onboarding wizard: draft a spec from existing knowledge (PDF, Word, Confluence, Jira, URLs, markdown). The draft is for human review — it never becomes authoritative on its own.'
  static examples = [
    '<%= config.bin %> onboard --list',
    '<%= config.bin %> onboard --into brief --from docs/vision.pdf --from https://wiki/overview',
    '<%= config.bin %> onboard --into prd --from jira:"project = ORD AND type = Epic"',
    '<%= config.bin %> onboard --into constitution --from confluence:123456 --from eng-standards/',
  ]
  static flags = {
    into: Flags.string({description: 'what to draft', options: Object.keys(TARGETS), default: 'brief'}),
    from: Flags.string({char: 'f', description: 'a source (file/glob/dir, URL, jira:…, confluence:…)', multiple: true}),
    out: Flags.string({char: 'o', description: 'output path (defaults per target, under specs/onboarding/)'}),
    llm: Flags.boolean({description: 'use the LLM to draft', default: true, allowNo: true}),
    list: Flags.boolean({description: 'list the supported source strategies and exit'}),
    'dry-run': Flags.boolean({description: 'gather and show sources, but do not draft'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Onboard)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)

    if (flags.list) {
      this.log('Supported source strategies:')
      for (const s of listStrategies()) this.log(`  ${s.name.padEnd(11)} ${s.description}`)
      this.log('\n  + custom importers via knowledge.plugins in speccord.config.yaml')
      this.log('\nUsage: speccord onboard --into <brief|prd|constitution|base|feature> --from <source> [--from ...]')
      return
    }

    const refs = flags.from ?? []
    if (refs.length === 0) this.error('Provide at least one --from source (or run `speccord onboard --list`).')

    this.log(`Gathering ${refs.length} source(s)…`)
    const {sources, warnings} = await gather(refs, {cwd, cfg: cfg?.knowledge})
    for (const w of warnings) this.warn(w)
    if (sources.length === 0) this.error('No knowledge could be loaded from the given sources.')

    this.log('Loaded:')
    for (const s of sources) this.log(`  • [${s.importer}] ${s.title} (${s.text.length} chars)`)

    if (flags['dry-run']) return

    const target = TARGETS[flags.into]
    const max = cfg?.knowledge?.maxChars ?? 24000
    let context = sources.map((s) => `## Source: ${s.title} (${s.importer})\n${s.text}`).join('\n\n')
    let truncated = false
    if (context.length > max) {
      context = context.slice(0, max)
      truncated = true
    }

    this.log(`\nDrafting ${target.title} with the ${target.role} persona${truncated ? ' (sources truncated)' : ''}…`)
    const body = await runPersona({role: target.role, task: target.task, context, useLlm: flags.llm, maxTokens: 2200})

    const out = flags.out ?? target.out
    const header =
      `<!-- DRAFT from knowledge onboarding — REVIEW before use. Generated by \`speccord onboard\`.\n` +
      `     Sources:\n${sources.map((s) => `       - ${s.title} (${s.uri})`).join('\n')}\n-->\n\n`
    await ensureDir(join(cwd, out, '..'))
    await writeFile(join(cwd, out), header + `# ${target.title} (draft)\n\n` + body + '\n')

    this.log(`\nDraft written to ${out}.`)
    this.log('Review and refine it, then promote it via the matching command:')
    const next: Record<string, string> = {
      brief: 'fold into  speccord prd',
      prd: 'copy to specs/prd.md, then  speccord prd --validate',
      constitution: 'copy to specs/constitution.md',
      base: 'merge into  speccord base new / base draft  (facts come from discover)',
      feature: 'copy into  speccord feature new  output and refine',
    }
    this.log(`  → ${next[flags.into]}`)
    this.log('\nReminder: this is model-drafted from source docs — confirm every fact before it becomes the contract.')
  }
}
