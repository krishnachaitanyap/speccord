import {join} from 'node:path'
import {readFile} from 'node:fs/promises'
import {Command, Args, Flags} from '@oclif/core'
import {runPersona} from '../lib/agents.js'
import {loadConfig, capabilityOn} from '../lib/config.js'

const LENSES: Record<string, string> = {
  adversarial:
    'Adversarially review this artifact. Find the ways it is wrong, ambiguous, or under-specified. ' +
    'List concrete, reproducible problems with severity (blocker/major/minor). Be skeptical by default.',
  'edge-cases':
    'Hunt for missing edge cases and failure modes: nulls, concurrency, retries, partial failures, ' +
    'auth/ownership boundaries, pagination limits, idempotency. List each with how it would be triggered.',
  tests:
    'Propose the test strategy: for each acceptance criterion, the test type(s) needed, plus the ' +
    'high-value tests currently missing. Flag any AC not linked to a test.',
}

export default class Review extends Command {
  static description = 'IMPLEMENTATION: QA review of a spec/story/plan through a chosen lens (qa persona).'
  static examples = [
    '<%= config.bin %> review specs/features/SPEC-1-*.md',
    '<%= config.bin %> review specs/stories/STORY-1-*.md --lens edge-cases',
  ]
  static args = {path: Args.string({description: 'artifact to review', required: true})}
  static flags = {
    lens: Flags.string({description: 'review lens', options: Object.keys(LENSES), default: 'adversarial'}),
    llm: Flags.boolean({description: 'use the LLM', default: true, allowNo: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Review)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)
    if (cfg && !capabilityOn(cfg, 'qaReview'))
      this.error(
        `The "qaReview" capability is off at scale ${cfg.methodology.scale}. ` +
          'Enable it (capabilities.qaReview: true) or raise the scale. See `speccord capabilities`.',
      )

    const content = await readFile(join(cwd, args.path), 'utf8')
    const result = await runPersona({
      role: 'qa',
      task: LENSES[flags.lens],
      context: `## Artifact: ${args.path}\n${content}`,
      useLlm: flags.llm,
      maxTokens: 1500,
    })
    this.log(`# QA review (${flags.lens}) — ${args.path}\n`)
    this.log(result)
  }
}
