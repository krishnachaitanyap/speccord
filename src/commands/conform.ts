import {join} from 'node:path'
import {readFile, writeFile} from 'node:fs/promises'
import {Command, Flags} from '@oclif/core'
import {discover} from '../lib/discovery/index.js'
import {structuralDrift, runCheck, type ConformanceReport} from '../lib/conformance/index.js'
import {BASELINE_PATH, CONFORMANCE_PATH, SPECCORD_DIR, ensureDir, loadConfig} from '../lib/config.js'
import type {DiscoveryReport} from '../lib/spec/model.js'

export default class Conform extends Command {
  static description =
    'Check the running service against its baseline: structural drift (re-discovery vs baseline) + configured contract checks.'
  static examples = ['<%= config.bin %> conform', '<%= config.bin %> conform --json']
  static flags = {
    root: Flags.string({char: 'r', description: 'repo root to scan', default: '.'}),
    json: Flags.boolean({description: 'print the full report as JSON'}),
    'skip-checks': Flags.boolean({description: 'only run structural drift, skip external checks'}),
    'update-baseline': Flags.boolean({
      description: 'snapshot the current discovered surface as the accepted baseline (after an intentional, spec-documented change, or to establish a greenfield baseline once code exists)',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Conform)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)

    // Re-establish the accepted surface: discover now and write it as the baseline.
    if (flags['update-baseline']) {
      const current = await discover(flags.root, cfg?.service, cfg?.discovery)
      await ensureDir(join(cwd, SPECCORD_DIR))
      await writeFile(join(cwd, BASELINE_PATH), JSON.stringify(current, null, 2))
      this.log(
        `Baseline updated from current discovery (${current.api.operations.length} ops, ` +
          `${current.data.tables.length} tables, ${current.events.topics.length} topics).`,
      )
      this.log('Make sure the base spec documents this surface — `speccord gate` enforces that in CI.')
      return
    }

    let baseline: DiscoveryReport | undefined
    try {
      baseline = JSON.parse(await readFile(join(cwd, BASELINE_PATH), 'utf8'))
    } catch {
      baseline = undefined
    }

    const drift =
      baseline && (cfg?.conformance.checkStructuralDrift ?? true)
        ? structuralDrift(baseline, await discover(flags.root, cfg?.service, cfg?.discovery))
        : []

    const checks =
      flags['skip-checks'] || !cfg
        ? []
        : await Promise.all(cfg.conformance.checks.map((c) => runCheck(c, cwd)))

    const report: ConformanceReport = {
      generatedAt: new Date().toISOString(),
      hasBaseline: Boolean(baseline),
      drift,
      checks,
      conformant: drift.length === 0 && checks.every((c) => c.passed),
    }

    await ensureDir(join(cwd, SPECCORD_DIR))
    await writeFile(join(cwd, CONFORMANCE_PATH), JSON.stringify(report, null, 2))

    if (flags.json) {
      this.log(JSON.stringify(report, null, 2))
      if (!report.conformant) this.exit(1)
      return
    }

    if (!baseline)
      this.warn(`No baseline at ${BASELINE_PATH}. Run \`speccord base draft\` to snapshot one; drift check skipped.`)

    if (drift.length === 0) {
      this.log('Structural drift: none — code matches the baseline contract surface.')
    } else {
      this.log(`Structural drift: ${drift.length} change(s) vs baseline:`)
      for (const d of drift) this.log(`  ${d.change === 'added' ? '+' : '-'} ${d.kind}: ${d.detail}`)
    }

    if (checks.length > 0) {
      this.log('\nContract checks:')
      for (const c of checks) this.log(`  ${c.passed ? '✓' : '✗'} ${c.name}`)
    }

    this.log(`\nReport written to ${CONFORMANCE_PATH}.`)
    if (!report.conformant)
      this.error('NOT CONFORMANT: the spec is out of date or a contract check failed. Update the base spec.', {
        exit: 1,
      })
    this.log('CONFORMANT.')
  }
}
