import type {DiscoveryReport} from '../spec/model.js'
import type {DiscoveryConfig} from '../config.js'
import {BUILTIN_PROVIDERS} from './builtin.js'
import {buildCustomProvider, loadPluginProviders} from './custom.js'
import {emptyReport, mergeInto, type DiscoveryContext, type DiscoveryProvider} from './provider.js'

// Assemble the providers that apply to this run: builtins (minus any disabled),
// declarative custom providers, and code plugins.
export async function assembleProviders(
  ctx: DiscoveryContext,
  cfg?: DiscoveryConfig,
): Promise<{providers: DiscoveryProvider[]; warnings: string[]}> {
  const disabled = new Set(cfg?.disable ?? [])
  const providers: DiscoveryProvider[] = BUILTIN_PROVIDERS.filter((p) => !disabled.has(p.name))
  const warnings: string[] = []

  for (const spec of cfg?.custom ?? []) {
    try {
      providers.push(buildCustomProvider(spec))
    } catch (e) {
      warnings.push(`bad custom provider "${spec?.name ?? '?'}": ${String(e)}`)
    }
  }
  if (cfg?.plugins?.length) {
    const loaded = await loadPluginProviders(ctx.root, cfg.plugins)
    providers.push(...loaded.providers.filter((p) => !disabled.has(p.name)))
    warnings.push(...loaded.warnings)
  }
  return {providers, warnings}
}

// Run all applicable providers and merge into one normalized report.
export async function runProviders(
  ctx: DiscoveryContext,
  providers: DiscoveryProvider[],
  serviceName: string,
): Promise<DiscoveryReport> {
  const report = emptyReport(serviceName, ctx.root, ctx.stack)

  const applicable: DiscoveryProvider[] = []
  for (const p of providers) {
    try {
      if (await p.detect(ctx)) applicable.push(p)
    } catch {
      /* a flaky detect shouldn't kill discovery */
    }
  }

  const results = await Promise.all(
    applicable.map(async (p) => {
      try {
        return await p.discover(ctx)
      } catch (e) {
        return {warnings: [`provider "${p.name}" failed: ${String(e)}`]}
      }
    }),
  )
  for (const r of results) mergeInto(report, r)
  return report
}
