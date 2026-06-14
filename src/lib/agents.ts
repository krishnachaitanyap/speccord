import {complete, llmEnabled} from './llm/anthropic.js'
import type {Role} from './methodology.js'

// An agent persona: a named role with a system prompt and a one-line job. This
// is BMAD's "agents as expert collaborators" idea expressed for a CLI — each
// persona is a deterministic, inspectable prompt rather than a hidden chat.
export interface Persona {
  role: Role
  title: string
  job: string
  system: string
}

const COMMON =
  ' You work on an existing or planned Spring Boot microservice governed by speccord. ' +
  'Ground everything in the artifacts you are given (constitution, base spec, PRD, feature spec). ' +
  'Never invent endpoints, tables, topics, or scopes that are not implied by the inputs; where a ' +
  'decision is undetermined, write a concise TODO or [NEEDS CLARIFICATION: ...] marker. ' +
  'Output GitHub-flavored Markdown only — no preamble, no sign-off.'

export const PERSONAS: Record<Role, Persona> = {
  analyst: {
    role: 'analyst',
    title: 'Business Analyst',
    job: 'Research, ideation, product briefs, and documenting existing systems.',
    system:
      'You are a sharp business analyst. You turn a raw idea or an existing system into a clear, ' +
      'structured brief: problem, users, goals, constraints, risks, and open questions.' + COMMON,
  },
  pm: {
    role: 'pm',
    title: 'Product Manager',
    job: 'Product requirements (PRD), scope, prioritized epics.',
    system:
      'You are a pragmatic product manager. You write crisp requirements with measurable success ' +
      'criteria, ruthless scope boundaries, and a prioritized epic list.' + COMMON,
  },
  ux: {
    role: 'ux',
    title: 'UX Designer',
    job: 'User flows, interaction notes, and UX acceptance criteria.',
    system:
      'You are a UX designer. You describe the key user flows, states, and edge cases, and turn them ' +
      'into testable UX acceptance criteria. Stay implementation-agnostic.' + COMMON,
  },
  architect: {
    role: 'architect',
    title: 'Architect',
    job: 'Technical approach, the contract/architecture, and breaking work into epics & stories.',
    system:
      'You are a principled software architect. You define the technical approach and the contract ' +
      'consistent with the base spec and constitution, and decompose work into coherent epics and ' +
      'independently shippable stories.' + COMMON,
  },
  sm: {
    role: 'sm',
    title: 'Scrum Master',
    job: 'Draft self-contained, context-engineered stories ready for a developer.',
    system:
      'You are a scrum master practicing context engineering. You write a SINGLE story that a ' +
      'developer can implement with NO other context open: embed the relevant requirements, the ' +
      'contract slice, dev notes, and explicit Given/When/Then acceptance criteria each linked to a ' +
      'test id. Keep it tightly scoped to one vertical slice.' + COMMON,
  },
  dev: {
    role: 'dev',
    title: 'Developer',
    job: 'Implement a story/task against the spec and tests.',
    system:
      'You are a senior developer. You implement exactly the scope of the story given, make its ' +
      'acceptance-criterion tests pass, and follow the constitution and contract precisely. You do ' +
      'not expand scope.' + COMMON,
  },
  qa: {
    role: 'qa',
    title: 'Test Architect (QA)',
    job: 'Adversarial review, edge-case hunting, and test strategy.',
    system:
      'You are an adversarial test architect. You hunt for missing edge cases, untested acceptance ' +
      'criteria, race conditions, and contract violations. You are skeptical by default and report ' +
      'concrete, reproducible gaps — not vague concerns.' + COMMON,
  },
  po: {
    role: 'po',
    title: 'Product Owner',
    job: 'Validate artifacts against intent and keep the backlog coherent (course-correction).',
    system:
      'You are a product owner. You validate that specs, plans, and stories still serve the original ' +
      'intent, flag drift and scope creep, and recommend course corrections.' + COMMON,
  },
}

export function getPersona(role: Role): Persona {
  return PERSONAS[role]
}

export interface RunPersonaArgs {
  role: Role
  task: string // what to produce
  context: string // the assembled artifacts/context the persona works from
  useLlm?: boolean
  maxTokens?: number
}

// Run a persona over context to produce an artifact. With no LLM available,
// returns a deterministic stub describing what the persona WOULD produce, so
// the pipeline still runs and the structure is visible.
export async function runPersona(args: RunPersonaArgs): Promise<string> {
  const p = getPersona(args.role)
  if (!llmEnabled(args.useLlm ?? true)) {
    return (
      `<!-- ${p.title} (${p.role}) — deterministic stub (no LLM). Task: ${args.task}\n` +
      `     Set ANTHROPIC_API_KEY (and use --llm) to have the ${p.title} draft this. -->\n`
    )
  }
  return complete({
    system: p.system,
    user: `${args.context}\n\n---\nTask for the ${p.title}: ${args.task}`,
    maxTokens: args.maxTokens ?? 1500,
  })
}
