import {join} from 'node:path'
import {Command, Args, Flags} from '@oclif/core'
import {input} from '@inquirer/prompts'
import {readSpec, writeSpec} from '../lib/spec/frontmatter.js'
import {complete, llmEnabled} from '../lib/llm/anthropic.js'

const MARKER_RE = /\[NEEDS CLARIFICATION(?::\s*([^\]]*))?\]/g

export default class Clarify extends Command {
  static description =
    'Resolve [NEEDS CLARIFICATION] markers in a feature spec; with --llm, also detect ambiguities and insert them.'
  static examples = ['<%= config.bin %> clarify specs/features/SPEC-142-order-cancellation.md']
  static args = {path: Args.string({description: 'path to the feature spec', required: true})}
  static flags = {
    llm: Flags.boolean({description: 'use the LLM to detect ambiguities first', default: false}),
    yes: Flags.boolean({char: 'y', description: 'non-interactive: just report markers, do not prompt'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Clarify)
    const cwd = process.cwd()
    const path = join(cwd, args.path)
    const spec = await readSpec(path)
    let body = spec.body

    // 1) Optionally let the model flag ambiguities by inserting markers.
    if (flags.llm && llmEnabled(true)) {
      this.log('Scanning for ambiguities with the LLM...')
      try {
        const questions = await complete({
          maxTokens: 600,
          system:
            'You review a feature spec for an existing microservice and list the underspecified ' +
            'decisions that would block a correct implementation. Output a plain bullet list of ' +
            'specific questions (max 5), no preamble. If the spec is fully clear, output "NONE".',
          user: spec.body,
        })
        if (!/^\s*NONE\s*$/i.test(questions)) {
          const items = questions
            .split('\n')
            .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
            .filter(Boolean)
            .slice(0, 5)
          if (items.length) {
            body += `\n\n## Open questions\n${items.map((q) => `- [NEEDS CLARIFICATION: ${q}]`).join('\n')}\n`
          }
        }
      } catch (e) {
        this.warn(`LLM ambiguity scan failed: ${String(e)}`)
      }
    }

    // 2) Collect markers.
    const markers = [...body.matchAll(MARKER_RE)]
    if (markers.length === 0) {
      this.log('No [NEEDS CLARIFICATION] markers. Spec is clarified.')
      if (body !== spec.body) await writeSpec(path, {...spec, body})
      return
    }

    this.log(`${markers.length} open clarification(s):`)
    for (const m of markers) this.log(`  - ${m[1]?.trim() || '(unspecified)'}`)

    if (flags.yes) {
      if (body !== spec.body) await writeSpec(path, {...spec, body})
      this.error('Spec has unresolved clarifications.', {exit: 1})
    }

    // 3) Resolve each marker in place.
    for (const m of markers) {
      const question = m[1]?.trim() || 'Clarify this point'
      const answer = await input({message: question, default: ''})
      if (answer.trim()) {
        body = body.replace(m[0], answer.trim())
      } else {
        this.log('  (left unresolved)')
      }
    }

    await writeSpec(path, {...spec, body})
    const remaining = [...body.matchAll(MARKER_RE)].length
    this.log(`\nSaved. ${remaining} clarification(s) still open.`)
    if (remaining > 0) this.exit(1)
  }
}
