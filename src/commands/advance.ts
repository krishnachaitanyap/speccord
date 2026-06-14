import {Command, Args, Flags} from '@oclif/core'
import {writeSpec} from '../lib/spec/frontmatter.js'
import {loadFeature, gateContextFor} from '../lib/spec/feature.js'
import {TRANSITIONS, gateFor, type SpecStatus} from '../lib/spec/model.js'
import {loadConfig} from '../lib/config.js'

export default class Advance extends Command {
  static description = 'Advance a spec to a new lifecycle status, enforcing the entry gate.'
  static examples = ['<%= config.bin %> advance specs/features/SPEC-142-order-cancellation.md --to Approved']
  static args = {
    path: Args.string({description: 'path to the spec file', required: true}),
  }
  static flags = {
    to: Flags.string({description: 'target status', required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Advance)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)
    const feature = await loadFeature(cwd, args.path)
    const spec = feature.spec

    const current = (spec.frontMatter.status as SpecStatus) ?? 'Draft'
    const target = flags.to as SpecStatus

    const allowed = TRANSITIONS[current] ?? []
    if (!allowed.includes(target)) {
      this.error(`Illegal transition ${current} → ${target}. Allowed: ${allowed.join(', ') || '(none)'}`)
    }

    // Build gate context from the spec AND its sibling artifacts; apply the
    // configured policy (preset/customization) when deciding optional gates.
    const ctx = gateContextFor(feature)
    const problems = gateFor(target, ctx, cfg?.customization ?? {})
    if (problems.length > 0) {
      this.log(`Gate to enter "${target}" not satisfied:`)
      for (const p of problems) this.log(`  - ${p}`)
      this.error('Blocked. Fix the above and retry.', {exit: 1})
    }

    spec.frontMatter.status = target
    spec.frontMatter.updated = new Date().toISOString().slice(0, 10)
    await writeSpec(feature.specPath, spec)
    this.log(`${args.path}: ${current} → ${target}`)
  }
}
