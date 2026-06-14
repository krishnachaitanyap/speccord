import {join} from 'node:path'
import {readFile, writeFile} from 'node:fs/promises'
import {Command, Args, Flags} from '@oclif/core'
import {PERSONAS, runPersona} from '../lib/agents.js'
import {ROLES, type Role} from '../lib/methodology.js'
import {loadConfig, roleOn} from '../lib/config.js'

export default class Agent extends Command {
  static description = 'List the agent personas, or run one over an input artifact to produce a draft.'
  static examples = [
    '<%= config.bin %> agent list',
    '<%= config.bin %> agent qa --input specs/features/SPEC-1-*.md',
    '<%= config.bin %> agent architect --input specs/base/orders.md --task "propose epics" --out epics.md',
  ]
  static args = {
    role: Args.string({description: 'persona to run (analyst|pm|ux|architect|sm|dev|qa|po) or "list"'}),
  }
  static flags = {
    input: Flags.string({char: 'i', description: 'file whose content is the persona context'}),
    task: Flags.string({char: 't', description: 'what to produce (defaults to the persona job)'}),
    out: Flags.string({char: 'o', description: 'write the result here instead of stdout'}),
    llm: Flags.boolean({description: 'use the LLM', default: true, allowNo: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Agent)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)

    if (!args.role || args.role === 'list') {
      this.log('Agent personas:')
      for (const r of ROLES) {
        const p = PERSONAS[r]
        const enabled = cfg ? (roleOn(cfg, r) ? 'on ' : 'off') : '?  '
        this.log(`  [${enabled}] ${r.padEnd(9)} ${p.title} — ${p.job}`)
      }
      this.log('\n"on/off" reflects methodology.roles for the current scale. Run: agent <role> --input <file>')
      return
    }

    if (!ROLES.includes(args.role as Role)) {
      this.error(`Unknown persona "${args.role}". One of: ${ROLES.join(', ')}, or "list".`)
    }
    const role = args.role as Role
    if (cfg && !roleOn(cfg, role)) {
      this.warn(`Role "${role}" is not enabled at scale ${cfg.methodology.scale}. Running anyway (ad hoc).`)
    }

    const context = flags.input
      ? `## Context: ${flags.input}\n${await readFile(join(cwd, flags.input), 'utf8')}`
      : '## Context\n(none provided)'
    const task = flags.task ?? PERSONAS[role].job

    const result = await runPersona({role, task, context, useLlm: flags.llm})
    if (flags.out) {
      await writeFile(join(cwd, flags.out), result)
      this.log(`${PERSONAS[role].title} wrote ${flags.out}.`)
    } else {
      this.log(result)
    }
  }
}
