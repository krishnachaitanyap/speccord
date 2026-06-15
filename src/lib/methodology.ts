// The methodology layer is speccord's scale-adaptive, phase/role-driven process
// with speccord's deterministic spine. Everything here is configuration the user
// controls: how much process (scale), which phases run, which roles exist, and
// which capabilities are switched on.

// The four delivery phases, in order.
export const PHASES = ['analysis', 'planning', 'solutioning', 'implementation'] as const
export type Phase = (typeof PHASES)[number]

// Agent personas (roles) available to drive the phases.
export const ROLES = ['analyst', 'pm', 'ux', 'architect', 'sm', 'dev', 'qa', 'po'] as const
export type Role = (typeof ROLES)[number]

// Switchable capabilities. Deterministic-spine capabilities (conformance, ciGate,
// lifecycle) are listed too so `capabilities` can report the whole picture.
export const CAPABILITIES = [
  'ideation', // brief / brainstorm (analyst)
  'prd', // product requirements doc (pm)
  'architecture', // base spec as the architecture/contract (architect)
  'ux', // UX spec (ux)
  'epicsStories', // epic/story sharding + story-driven dev (sm/dev)
  'qaReview', // adversarial / edge-case review (qa)
  'lifecycle', // status machine + entry gates
  'conformance', // runtime drift vs baseline
  'ciGate', // CI contract-surface drift gate
] as const
export type Capability = (typeof CAPABILITIES)[number]

export interface Methodology {
  scale: number // 0..4
  phases: Phase[]
  roles: Role[]
}

export type Capabilities = Record<Capability, boolean>

// Named scale levels. Each implies a default phase set, role set,
// and capability profile — the user can override any piece explicitly.
export interface ScaleLevel {
  level: number
  name: string
  blurb: string
  phases: Phase[]
  roles: Role[]
  caps: Capability[] // capabilities ON at this scale
}

export const SCALE_LEVELS: ScaleLevel[] = [
  {
    level: 0,
    name: 'prototype',
    blurb: 'Throwaway spike. Just implement; no ceremony.',
    phases: ['implementation'],
    roles: ['dev'],
    caps: ['conformance'],
  },
  {
    level: 1,
    name: 'small',
    blurb: 'Small change/service. Spec + plan + implement, lightweight.',
    phases: ['planning', 'implementation'],
    roles: ['pm', 'dev'],
    caps: ['architecture', 'epicsStories', 'lifecycle', 'conformance', 'ciGate'],
  },
  {
    level: 2,
    name: 'medium',
    blurb: 'Standard feature work. Plan, solution, story-driven dev, QA.',
    phases: ['planning', 'solutioning', 'implementation'],
    roles: ['pm', 'architect', 'sm', 'dev', 'qa'],
    caps: ['prd', 'architecture', 'epicsStories', 'qaReview', 'lifecycle', 'conformance', 'ciGate'],
  },
  {
    level: 3,
    name: 'large',
    blurb: 'Larger initiative. Add analysis/ideation and UX.',
    phases: ['analysis', 'planning', 'solutioning', 'implementation'],
    roles: ['analyst', 'pm', 'ux', 'architect', 'sm', 'dev', 'qa'],
    caps: [
      'ideation',
      'prd',
      'architecture',
      'ux',
      'epicsStories',
      'qaReview',
      'lifecycle',
      'conformance',
      'ciGate',
    ],
  },
  {
    level: 4,
    name: 'enterprise',
    blurb: 'Full lifecycle with product ownership and compliance gates.',
    phases: ['analysis', 'planning', 'solutioning', 'implementation'],
    roles: ['analyst', 'pm', 'ux', 'architect', 'sm', 'dev', 'qa', 'po'],
    caps: [
      'ideation',
      'prd',
      'architecture',
      'ux',
      'epicsStories',
      'qaReview',
      'lifecycle',
      'conformance',
      'ciGate',
    ],
  },
]

export function scaleByLevel(level: number): ScaleLevel {
  return SCALE_LEVELS.find((s) => s.level === level) ?? SCALE_LEVELS[2]
}

export function scaleByName(name: string): ScaleLevel | undefined {
  return SCALE_LEVELS.find((s) => s.name === name || String(s.level) === name)
}

// Default methodology for a scale level.
export function defaultMethodology(level: number): Methodology {
  const s = scaleByLevel(level)
  return {scale: level, phases: [...s.phases], roles: [...s.roles]}
}

// Default capability map for a scale level (everything else off).
export function defaultCapabilities(level: number): Capabilities {
  const on = new Set(scaleByLevel(level).caps)
  return Object.fromEntries(CAPABILITIES.map((c) => [c, on.has(c)])) as Capabilities
}

// Which phase a capability/command belongs to — used for help/reporting.
export const CAPABILITY_PHASE: Record<Capability, Phase> = {
  ideation: 'analysis',
  prd: 'planning',
  architecture: 'solutioning',
  ux: 'planning',
  epicsStories: 'implementation',
  qaReview: 'implementation',
  lifecycle: 'implementation',
  conformance: 'implementation',
  ciGate: 'implementation',
}
