import Anthropic from '@anthropic-ai/sdk'
import type {DiscoveryReport} from '../spec/model.js'

const DEFAULT_MODEL = process.env.SPECCORD_MODEL ?? 'claude-sonnet-4-6'

export interface DraftOptions {
  useLlm: boolean
  model?: string
}

// True when prose generation can actually call the model.
export function llmEnabled(useLlm: boolean): boolean {
  return useLlm && Boolean(process.env.ANTHROPIC_API_KEY)
}

export interface CompleteArgs {
  system: string
  user: string
  maxTokens?: number
  model?: string
}

// Low-level single-turn completion used by every generative command.
// Hybrid contract: callers pass deterministic FACTS in `user` and ask the
// model only to write prose/structure around them — never to invent facts.
export async function complete(args: CompleteArgs): Promise<string> {
  const client = new Anthropic()
  const msg = await client.messages.create({
    model: args.model ?? DEFAULT_MODEL,
    max_tokens: args.maxTokens ?? 1200,
    system: args.system,
    messages: [{role: 'user', content: args.user}],
  })
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

const SECTIONS: {key: string; instruction: string}[] = [
  {key: 'purpose', instruction: 'Purpose & responsibilities, including what the service owns and the bounded context it does NOT own.'},
  {key: 'api', instruction: 'API standards that apply to every operation: error format, idempotency, pagination, and backward-compatibility policy.'},
  {key: 'stateMachine', instruction: 'The domain state machine: the only legal states and transitions for the core aggregate.'},
  {key: 'persistence', instruction: 'Persistence rules: transaction isolation and retry handling, primary-key strategy, and migration policy.'},
  {key: 'eventing', instruction: 'Eventing rules: event schemas and versions, delivery semantics, the outbox pattern, and trace propagation.'},
  {key: 'security', instruction: 'Security model: authentication, authorization (scopes/roles plus resource ownership), audit, and data handling.'},
  {key: 'nfr', instruction: 'Non-functional requirements / SLOs: availability, latency, capacity, and backward compatibility.'},
  {key: 'observability', instruction: 'Observability baseline applied to every endpoint: required structured-log fields, required metrics, and required traces with context propagation.'},
  {key: 'conformance', instruction: 'Conformance criteria (C-1..C-n): concrete automated checks that verify the running service matches this spec.'},
]

function factsSummary(r: DiscoveryReport): string {
  return JSON.stringify(
    {
      service: r.service.name,
      api: {file: r.api.file, version: r.api.version, operations: r.api.operations, securitySchemes: r.api.securitySchemes},
      tables: r.data.tables.map((t) => ({name: t.name, columns: t.columns, primaryKey: t.primaryKey})),
      topics: r.events.topics,
      security: r.security,
    },
    null,
    2,
  )
}

function fallback(key: string): string {
  return `<!-- DRAFT (deterministic, no LLM): fill in "${key}". Set SPECCORD_USE_LLM and ANTHROPIC_API_KEY to auto-draft. -->`
}

/**
 * Draft the prose sections of the base spec from discovered facts.
 * Hybrid: facts are deterministic; only the prose around them is model-generated.
 */
export async function draftBaseSections(
  report: DiscoveryReport,
  opts: DraftOptions,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}

  if (!llmEnabled(opts.useLlm)) {
    for (const s of SECTIONS) out[s.key] = fallback(s.key)
    return out
  }

  const facts = factsSummary(report)
  for (const s of SECTIONS) {
    try {
      const text = await complete({
        model: opts.model,
        maxTokens: 700,
        system:
          'You draft one section of a service specification for a Spring Boot microservice. ' +
          'Use ONLY the discovered facts provided; do not invent endpoints, tables, topics, or scopes. ' +
          'Where a fact is unknown, write a TODO marker for the developer to confirm. ' +
          'Output GitHub-flavored Markdown prose only (no headings, no preamble).',
        user: `Discovered facts (JSON):\n${facts}\n\nDraft this section: ${s.instruction}`,
      })
      out[s.key] = text || fallback(s.key)
    } catch (e) {
      out[s.key] = `<!-- LLM draft failed for "${s.key}": ${String(e)} -->`
    }
  }
  return out
}

function intentFallback(key: string): string {
  return `<!-- DRAFT (deterministic, no LLM): design the TARGET "${key}" for this new service. Set ANTHROPIC_API_KEY + use --llm to auto-draft. -->`
}

/**
 * Draft the prose sections of a GREENFIELD base spec from a product intent.
 * There are no discovered facts yet — these sections describe the INTENDED
 * contract the service-to-be will be built and checked against. Anything not
 * implied by the intent is left as an explicit TODO, never invented.
 */
export async function draftBaseSectionsFromIntent(
  intent: string,
  opts: DraftOptions,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}

  if (!llmEnabled(opts.useLlm)) {
    for (const s of SECTIONS) out[s.key] = intentFallback(s.key)
    return out
  }

  for (const s of SECTIONS) {
    try {
      const text = await complete({
        model: opts.model,
        maxTokens: 700,
        system:
          'You draft one section of the TARGET specification for a NEW Spring Boot microservice, ' +
          'from the product intent provided. Define the intended contract clearly and conservatively. ' +
          'Do NOT over-specify: where the intent does not determine a decision, write a concise TODO ' +
          'marker for the team to decide rather than inventing detail. ' +
          'Output GitHub-flavored Markdown prose only (no headings, no preamble).',
        user: `Product intent for the new service:\n${intent}\n\nDraft this section: ${s.instruction}`,
      })
      out[s.key] = text || intentFallback(s.key)
    } catch (e) {
      out[s.key] = `<!-- LLM draft failed for "${s.key}": ${String(e)} -->`
    }
  }
  return out
}
