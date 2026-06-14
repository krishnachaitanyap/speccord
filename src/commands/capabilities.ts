import {Command, Flags} from '@oclif/core'
import {loadConfig, PACKS} from '../lib/config.js'
import {
  CAPABILITIES,
  CAPABILITY_PHASE,
  PHASES,
  ROLES,
  SCALE_LEVELS,
  scaleByLevel,
  type Capability,
} from '../lib/methodology.js'

// What command(s) each capability unlocks — so the report tells the user not
// just what's on, but what they can DO with it.
const CAP_COMMANDS: Record<Capability, string> = {
  ideation: 'brief',
  prd: 'prd',
  architecture: 'discover, base draft|new, plan',
  ux: 'agent ux',
  epicsStories: 'story new|list|next|advance, implement',
  qaReview: 'review, agent qa',
  lifecycle: 'advance, status, lint',
  conformance: 'conform',
  ciGate: 'gate',
}

export default class Capabilities extends Command {
  static description =
    'Show the configured methodology: scale, active phases, enabled roles, and which capabilities/commands are on — and how to change them.'
  static examples = ['<%= config.bin %> capabilities', '<%= config.bin %> capabilities --scales']
  static flags = {
    scales: Flags.boolean({description: 'list the available scale levels and exit'}),
    packs: Flags.boolean({description: 'list the available packs and exit'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Capabilities)

    if (flags.scales) {
      this.log('Scale levels (set methodology.scale, or init --scale):')
      for (const s of SCALE_LEVELS) this.log(`  ${s.level} ${s.name.padEnd(10)} ${s.blurb}`)
      return
    }
    if (flags.packs) {
      this.log('Packs (set `pack:` in config, or init --pack):')
      for (const [name, p] of Object.entries(PACKS)) this.log(`  ${name.padEnd(20)} ${p.description}`)
      return
    }

    const cfg = await loadConfig(process.cwd())
    if (!cfg) this.error('No speccord.config.yaml found. Run `speccord init` first.')

    const m = cfg!.methodology
    const lvl = scaleByLevel(m.scale)
    this.log(`Service:  ${cfg!.service}`)
    this.log(`Pack:     ${cfg!.pack ?? '(none)'}    Preset: ${cfg!.preset ?? '(none)'}`)
    this.log(`Scale:    ${m.scale} (${lvl.name}) — ${lvl.blurb}`)

    this.log(`\nPhases (active in bold order):`)
    for (const ph of PHASES) {
      const on = m.phases.includes(ph)
      this.log(`  [${on ? 'x' : ' '}] ${ph}`)
    }

    this.log(`\nRoles (personas — see \`speccord agent list\`):`)
    this.log('  ' + ROLES.map((r) => `${m.roles.includes(r) ? r : `(${r})`}`).join('  '))

    this.log(`\nCapabilities:`)
    for (const c of CAPABILITIES) {
      const on = cfg!.capabilities[c]
      this.log(`  [${on ? 'x' : ' '}] ${c.padEnd(13)} ${CAPABILITY_PHASE[c].padEnd(14)} → ${CAP_COMMANDS[c]}`)
    }

    this.log(
      `\nChange it: edit speccord.config.yaml — set \`methodology.scale\` (0-4) to reshape defaults, ` +
        `\ntoggle individual \`capabilities.<name>\`, pick a \`pack:\`, or run \`init --scale <n>\`. ` +
        `\nSee \`capabilities --scales\` and \`--packs\`.`,
    )
  }
}
