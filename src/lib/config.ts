import {join} from 'node:path'
import {mkdir, readFile} from 'node:fs/promises'
import {parse} from 'yaml'
import type {GatePolicy} from './spec/model.js'
import type {CustomProviderSpec} from './discovery/custom.js'
import {
  defaultCapabilities,
  defaultMethodology,
  type Capabilities,
  type Capability,
  type Methodology,
  type Role,
} from './methodology.js'

// A configured conformance check: an external command whose exit code
// determines pass/fail (contract tests, schema-registry compat, Pact, etc.).
export interface ConformanceCheck {
  name: string
  run: string // shell command, run from the repo root
  description?: string
}

// How discovery finds the contract surface. The enterprise extensibility lives
// here: disable builtins, declare custom providers for proprietary frameworks,
// or load code plugins — all without forking speccord.
export interface DiscoveryConfig {
  autoDetect?: boolean // (reserved) auto-select providers from the detected stack
  disable?: string[] // provider names to turn off, e.g. ['kafka']
  custom?: CustomProviderSpec[] // declarative regex/glob providers
  plugins?: string[] // JS modules exporting DiscoveryProvider[]
}

export interface SpeccordConfig {
  service: string
  baseSpec: string // path to the base spec markdown
  constitution: string // path to the project constitution markdown
  specsDir: string
  featuresDir: string
  // Contract-surface globs used by `gate` to detect changes that need a spec update.
  contractSurface: string[]
  // How the codebase is discovered (providers, custom rules, plugins).
  discovery?: DiscoveryConfig
  // Customization knobs (a preset is just a named bundle of these).
  customization: GatePolicy
  // Runtime conformance: structural drift vs the baseline + external checks.
  conformance: {
    checkStructuralDrift: boolean
    checks: ConformanceCheck[]
  }
  // How `implement` drives a coding agent (optional).
  implement?: {
    agentCommand?: string // receives the per-task prompt on stdin; e.g. "claude -p"
    testCommand?: string // run after each task to verify; e.g. "./mvnw test"
  }
  // Directory for context-engineered story files (BMAD-style story-driven dev).
  storiesDir: string
  // Product Requirements Document path (product-level, above the base spec).
  prdPath: string
  // Methodology layer: how much process, which phases, which roles.
  methodology: Methodology
  // Switchable capabilities (defaults derive from methodology.scale).
  capabilities: Capabilities
  // How agent personas are run (optional; reuses implement.agentCommand if unset).
  agents?: {
    command?: string // a coding/LLM agent command that receives a prompt on stdin
  }
  // Name of a built-in preset to overlay (see PRESETS below).
  preset?: string
  // Name of a built-in pack to overlay (bundles methodology + capabilities + preset).
  pack?: string
}

export const CONFIG_FILE = 'speccord.config.yaml'
export const SPECCORD_DIR = '.speccord'
export const REPORT_PATH = '.speccord/discovery-report.json'
export const BASELINE_PATH = '.speccord/baseline.json'
export const CONFORMANCE_PATH = '.speccord/conformance-report.json'

// Built-in presets: named overlays merged on top of the base config.
// Mirrors spec-kit's "presets customize how it works" without a plugin loader.
export const PRESETS: Record<string, Partial<SpeccordConfig>> = {
  // The default forward workflow: plan+tasks required before implementing.
  standard: {
    customization: {requirePlanForImplementation: true},
  },
  // Regulated environments: nothing is approved without a complete checklist,
  // no open clarifications, and a green plan/tasks chain.
  compliance: {
    customization: {
      requirePlanForImplementation: true,
      requireChecklistForApproval: true,
      blockOnOpenClarifications: true,
    },
  },
  // Fast/greenfield iteration: keep the lifecycle but drop the heavier gates.
  lite: {
    customization: {requirePlanForImplementation: false},
  },
}

// Packs bundle a whole methodology profile (scale + preset). They are the
// top-level "how do you want to work" knob; capabilities then derive from scale
// unless overridden. Generalizes spec-kit presets toward BMAD-style modules.
export const PACKS: Record<string, Partial<SpeccordConfig> & {description: string}> = {
  'service-brownfield': {
    description: 'Existing service: discover the contract, then medium-scale feature work.',
    methodology: {scale: 2, phases: [], roles: []},
    preset: 'standard',
  },
  'service-greenfield': {
    description: 'New service from intent: lighter process to move fast early.',
    methodology: {scale: 1, phases: [], roles: []},
    preset: 'lite',
  },
  product: {
    description: 'Product initiative: ideation + PRD + UX + architecture + story-driven dev.',
    methodology: {scale: 3, phases: [], roles: []},
    preset: 'standard',
  },
  enterprise: {
    description: 'Full lifecycle with product ownership and compliance gates.',
    methodology: {scale: 4, phases: [], roles: []},
    preset: 'compliance',
  },
  prototype: {
    description: 'Throwaway spike: implement only, conformance on, no ceremony.',
    methodology: {scale: 0, phases: [], roles: []},
    preset: 'lite',
  },
}

export function defaultConfig(service: string, scale = 2): SpeccordConfig {
  return {
    service,
    baseSpec: `specs/base/${service}.md`,
    constitution: 'specs/constitution.md',
    specsDir: 'specs',
    featuresDir: 'specs/features',
    storiesDir: 'specs/stories',
    prdPath: 'specs/prd.md',
    contractSurface: [
      '**/openapi*.{yaml,yml,json}',
      '**/*.{graphql,gql}',
      '**/*.proto',
      '**/asyncapi*.{yaml,yml,json}',
      '**/db/migration/**/*.sql',
      '**/migrations/**/*.sql',
      '**/resources/**/V*__*.sql',
      '**/schema.prisma',
      '**/*SecurityConfig*.java',
    ],
    discovery: {autoDetect: true, disable: [], custom: [], plugins: []},
    customization: {requirePlanForImplementation: true},
    conformance: {
      checkStructuralDrift: true,
      checks: [
        // Example — replace with your contract-test runners:
        // {name: 'contract-tests', run: './mvnw -q test -Dtest=*ContractTest'},
      ],
    },
    methodology: defaultMethodology(scale),
    capabilities: defaultCapabilities(scale),
    preset: 'standard',
  }
}

// Deep-ish merge sufficient for our flat-ish config shape. Overlay wins per key.
// Empty arrays in an overlay's methodology mean "inherit" (used by packs that
// only want to set the scale and let phases/roles derive from it).
function mergeConfig(base: SpeccordConfig, overlay: Partial<SpeccordConfig>): SpeccordConfig {
  const m = overlay.methodology
  return {
    ...base,
    ...overlay,
    customization: {...base.customization, ...(overlay.customization ?? {})},
    conformance: {...base.conformance, ...(overlay.conformance ?? {})},
    implement: {...base.implement, ...(overlay.implement ?? {})},
    agents: {...base.agents, ...(overlay.agents ?? {})},
    discovery: {...base.discovery, ...(overlay.discovery ?? {})},
    methodology: m
      ? {
          scale: m.scale ?? base.methodology.scale,
          phases: m.phases && m.phases.length ? m.phases : base.methodology.phases,
          roles: m.roles && m.roles.length ? m.roles : base.methodology.roles,
        }
      : base.methodology,
    capabilities: {...base.capabilities, ...(overlay.capabilities ?? {})},
  }
}

export async function loadConfig(cwd: string): Promise<SpeccordConfig | undefined> {
  let raw: string
  try {
    raw = await readFile(join(cwd, CONFIG_FILE), 'utf8')
  } catch {
    return undefined
  }
  const user = (parse(raw) ?? {}) as Partial<SpeccordConfig>
  const service = user.service ?? 'service'
  const pack = user.pack ? PACKS[user.pack] : undefined

  // Effective scale: explicit user > pack > default. Capability + phase/role
  // defaults are computed from THIS scale so changing one number reshapes the
  // whole methodology — then explicit settings win layer by layer.
  const scale = user.methodology?.scale ?? pack?.methodology?.scale ?? 2

  let cfg = defaultConfig(service, scale) // base defaults from scale
  if (pack) cfg = mergeConfig(cfg, pack) // pack overlay
  const presetName = user.preset ?? pack?.preset
  if (presetName && PRESETS[presetName]) cfg = mergeConfig(cfg, PRESETS[presetName]) // preset overlay
  cfg = mergeConfig(cfg, user) // explicit user config wins
  return cfg
}

export function capabilityOn(cfg: SpeccordConfig | undefined, cap: Capability): boolean {
  return Boolean(cfg?.capabilities?.[cap])
}

export function roleOn(cfg: SpeccordConfig | undefined, role: Role): boolean {
  return Boolean(cfg?.methodology?.roles?.includes(role))
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, {recursive: true})
}
