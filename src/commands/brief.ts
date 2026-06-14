import {join} from 'node:path'
import {readFile, writeFile} from 'node:fs/promises'
import {Command, Flags} from '@oclif/core'
import {input} from '@inquirer/prompts'
import {runPersona} from '../lib/agents.js'
import {ensureDir, loadConfig, capabilityOn} from '../lib/config.js'

export default class Brief extends Command {
  static description = 'ANALYSIS: turn a raw idea (or existing brief) into a structured product brief (analyst persona).'
  static examples = ['<%= config.bin %> brief --idea "A service that issues and redeems gift cards"']
  static flags = {
    idea: Flags.string({char: 'i', description: 'the raw idea / problem statement'}),
    out: Flags.string({char: 'o', description: 'output path', default: 'specs/brief.md'}),
    llm: Flags.boolean({description: 'use the LLM', default: true, allowNo: true}),
    force: Flags.boolean({description: 'overwrite an existing brief'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Brief)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)
    if (cfg && !capabilityOn(cfg, 'ideation'))
      this.error(
        `The "ideation" capability is off at scale ${cfg.methodology.scale}. ` +
          'Enable it (capabilities.ideation: true) or raise the scale. See `speccord capabilities`.',
      )

    const outAbs = join(cwd, flags.out)
    if (!flags.force) {
      try {
        await readFile(outAbs, 'utf8')
        this.error(`${flags.out} exists. Use --force to overwrite.`)
      } catch {
        /* good */
      }
    }

    const idea = flags.idea ?? (await input({message: 'Describe the idea / problem'}))
    if (!idea.trim()) this.error('An idea is required.')

    const result = await runPersona({
      role: 'analyst',
      task:
        'Write a product brief: problem, target users, goals & success metrics, key constraints, ' +
        'risks, and open questions (use [NEEDS CLARIFICATION: ...] for unknowns).',
      context: `## Idea\n${idea}`,
      useLlm: flags.llm,
    })

    await ensureDir(join(outAbs, '..'))
    await writeFile(outAbs, `# Product Brief\n\n${result}\n`)
    this.log(`Brief written to ${flags.out}.`)
    this.log('Next: speccord prd   (Product Manager turns this into requirements + epics)')
  }
}
