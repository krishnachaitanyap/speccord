import {basename, join} from 'node:path'
import {writeFile} from 'node:fs/promises'
import {Command, Flags} from '@oclif/core'
import {stringify} from 'yaml'
import {CONFIG_FILE, PACKS, defaultConfig, ensureDir, type SpeccordConfig} from '../lib/config.js'
import {featureSpecBody} from '../lib/spec/templates.js'
import {constitutionTemplate} from '../lib/spec/constitution.js'
import {scaleByName} from '../lib/methodology.js'

export default class Init extends Command {
  static description = 'Scaffold the specs/ layout, templates, and speccord.config.yaml.'
  static flags = {
    service: Flags.string({char: 's', description: 'service name (defaults to cwd name)'}),
    scale: Flags.string({description: 'methodology scale: 0|prototype 1|small 2|medium 3|large 4|enterprise (default 2, or the pack default)'}),
    pack: Flags.string({description: `pack to start from: ${Object.keys(PACKS).join(', ')}`}),
    greenfield: Flags.boolean({description: 'new service (no code yet): guide toward `base new` instead of `discover`'}),
    force: Flags.boolean({description: 'overwrite an existing config'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Init)
    const cwd = process.cwd()
    const service = flags.service ?? basename(cwd)

    const pack = flags.pack ? PACKS[flags.pack] : undefined
    if (flags.pack && !pack)
      this.error(`Unknown pack "${flags.pack}". One of: ${Object.keys(PACKS).join(', ')}.`)

    // Effective scale: explicit --scale wins; else the pack's scale; else 2.
    let level = pack?.methodology?.scale ?? 2
    if (flags.scale) {
      const s = scaleByName(flags.scale)
      if (!s) this.error(`Unknown scale "${flags.scale}". Use 0-4 or prototype|small|medium|large|enterprise.`)
      level = s!.level
    }
    const scale = scaleByName(String(level))!

    const cfg = defaultConfig(service, level)
    if (flags.pack) {
      cfg.pack = flags.pack
      if (pack!.preset) cfg.preset = pack!.preset // surface the pack's preset in the written config
    }

    await ensureDir(join(cwd, 'specs', 'base'))
    await ensureDir(join(cwd, 'specs', 'features'))
    await ensureDir(join(cwd, 'specs', 'stories'))
    await ensureDir(join(cwd, 'specs', 'templates'))
    await ensureDir(join(cwd, '.speccord'))

    await writeFile(join(cwd, 'specs', 'templates', 'feature-spec.template.md'), featureSpecBody())
    await writeFile(join(cwd, cfg.constitution), constitutionTemplate(service))
    // Persist the resolved config (so the methodology/capabilities are visible & editable).
    await writeFile(join(cwd, CONFIG_FILE), stringify(cfg as SpeccordConfig))

    this.log(`Initialized speccord for service "${service}".`)
    this.log(`  - ${CONFIG_FILE} (scale: ${scale.level}/${scale.name}${flags.pack ? `, pack: ${flags.pack}` : ''}, preset: ${cfg.preset})`)
    this.log(`  - ${cfg.constitution}`)
    this.log('  - specs/{base,features,stories,templates}/')
    this.log('\nSee what is enabled at this scale:  speccord capabilities')
    if (flags.greenfield) {
      this.log('\nGreenfield. Next: speccord base new --intent "..."   (no code to discover yet)')
    } else {
      this.log('\nBrownfield. Next: speccord discover   then   speccord base draft')
    }
    this.log('Then: (brief ->) prd -> feature new -> clarify -> plan -> tasks -> analyze -> advance -> story new -> implement -> review')
  }
}
