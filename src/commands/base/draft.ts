import {join} from 'node:path'
import {readFile, writeFile} from 'node:fs/promises'
import {Command, Flags} from '@oclif/core'
import {confirm, input} from '@inquirer/prompts'
import {discover} from '../../lib/discovery/index.js'
import {draftBaseSections} from '../../lib/llm/anthropic.js'
import {baseSpecBody} from '../../lib/spec/templates.js'
import {serializeSpec} from '../../lib/spec/frontmatter.js'
import {BASELINE_PATH, SPECCORD_DIR, ensureDir, loadConfig} from '../../lib/config.js'
import type {DiscoveryReport, FrontMatter} from '../../lib/spec/model.js'
import {REPORT_PATH} from '../discover.js'

export default class BaseDraft extends Command {
  static description = 'Draft the base spec from discovery, review/confirm facts with the developer, then generate it.'
  static examples = ['<%= config.bin %> base draft', '<%= config.bin %> base draft --yes --no-llm']
  static flags = {
    root: Flags.string({char: 'r', description: 'repo root to scan', default: '.'}),
    yes: Flags.boolean({char: 'y', description: 'skip interactive review (accept discovered facts)'}),
    llm: Flags.boolean({description: 'use the LLM to draft prose', default: true, allowNo: true}),
    out: Flags.string({char: 'o', description: 'output path for the base spec'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BaseDraft)
    const cwd = process.cwd()
    const cfg = await loadConfig(cwd)

    // 1) DISCOVER (reuse cached report if present, else scan)
    let report: DiscoveryReport
    try {
      report = JSON.parse(await readFile(join(cwd, REPORT_PATH), 'utf8'))
      this.log(`Using cached discovery report (${REPORT_PATH}).`)
    } catch {
      this.log('No cached report — scanning...')
      report = await discover(flags.root, cfg?.service, cfg?.discovery)
    }

    // 2) REVIEW + CONFIRM (interactive unless --yes)
    if (!flags.yes) {
      report = await this.review(report)
    }

    // 3) DRAFT prose (LLM hybrid) + GENERATE
    this.log(flags.llm ? 'Drafting prose with the LLM...' : 'Generating with deterministic placeholders...')
    const prose = await draftBaseSections(report, {useLlm: flags.llm})
    const body = baseSpecBody(report, prose)
    const fm: FrontMatter = {
      service: report.service.name,
      status: 'Draft',
      specVersion: '0.1',
      generatedBy: 'speccord',
      generatedAt: report.generatedAt,
    }
    const md = serializeSpec({frontMatter: fm, body})

    const out = flags.out ?? cfg?.baseSpec ?? `specs/base/${report.service.name}.md`
    await ensureDir(join(cwd, out, '..'))
    await writeFile(join(cwd, out), md)

    // Snapshot the confirmed facts as the conformance baseline so `speccord
    // conform` can detect when the running code drifts from this spec.
    await ensureDir(join(cwd, SPECCORD_DIR))
    await writeFile(join(cwd, BASELINE_PATH), JSON.stringify(report, null, 2))

    this.log(`\nBase spec written to ${out} (status: Draft).`)
    this.log(`Conformance baseline snapshot written to ${BASELINE_PATH}.`)
    this.log('Review the TODO markers, then move it through review with: speccord status')
  }

  // Walk the developer through discovered facts. Each group can be confirmed,
  // corrected, or flagged as a known deviation. Nothing is written as truth
  // until it passes through here.
  private async review(report: DiscoveryReport): Promise<DiscoveryReport> {
    this.log('\n--- Review discovered facts ---')

    const name = await input({message: 'Service name', default: report.service.name})
    report.service.name = name

    this.log(`\nAPI: ${report.api.operations.length} operations from ${report.api.file ?? '(none found)'}`)
    for (const op of report.api.operations.slice(0, 20)) {
      this.log(`  ${op.method.toUpperCase()} ${op.path}  scopes=[${op.scopes.join(', ')}]`)
    }
    const apiOk = await confirm({message: 'Do the discovered operations look correct?', default: true})
    if (!apiOk) {
      this.log('  (left as-is; correct them in the generated spec or fix the OpenAPI source)')
    }

    this.log(`\nData: ${report.data.tables.length} tables`)
    for (const t of report.data.tables) this.log(`  ${t.name} (${t.columns.length} cols, pk=${t.primaryKey.join(',')})`)

    this.log(`\nEvents: ${report.events.topics.length} topics`)
    for (const t of report.events.topics) this.log(`  ${t.name} [${t.role}]`)

    this.log(`\nSecurity: scopes=[${report.security.scopes.join(', ')}], resource-server=${report.security.resourceServer}`)
    const extraScopes = await input({
      message: 'Add any scopes discovery missed (comma-separated, blank to skip)',
      default: '',
    })
    if (extraScopes.trim()) {
      report.security.scopes = [
        ...new Set([...report.security.scopes, ...extraScopes.split(',').map((s) => s.trim()).filter(Boolean)]),
      ].sort()
    }

    const deviation = await input({
      message: 'Record a known deviation (as-is vs desired), blank to skip',
      default: '',
    })
    if (deviation.trim()) report.warnings.push(`KNOWN DEVIATION: ${deviation.trim()}`)

    return report
  }
}
