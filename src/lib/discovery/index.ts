import {basename} from 'node:path'
import type {DiscoveryReport} from '../spec/model.js'
import type {DiscoveryConfig} from '../config.js'
import {detectStack} from './stack.js'
import {assembleProviders, runProviders} from './registry.js'
import type {DiscoveryContext} from './provider.js'

export type {DiscoveryProvider, ProviderResult, Stack, SurfaceKind} from './provider.js'
export type {CustomProviderSpec} from './custom.js'

// Stack-agnostic discovery: detect the stack, assemble the applicable providers
// (builtin + enterprise custom + plugins), run them, and merge into one report.
// Signature is back-compatible; pass `discovery` config to enable custom providers.
export async function discover(
  root: string,
  serviceName?: string,
  discovery?: DiscoveryConfig,
): Promise<DiscoveryReport> {
  const stack = await detectStack(root)
  const ctx: DiscoveryContext = {root, stack}

  const {providers, warnings} = await assembleProviders(ctx, discovery)
  const report = await runProviders(ctx, providers, serviceName ?? basename(root))
  report.warnings.push(...warnings)
  return report
}
