import type {DiscoveryReport, FrontMatter} from './model.js'

// Renders a base-spec body from discovered facts + LLM-drafted prose per section.
// `prose` maps section keys to LLM-drafted paragraphs; falls back to TODO markers.
export function baseSpecBody(report: DiscoveryReport, prose: Record<string, string>): string {
  const ops = report.api.operations
    .map(
      (o) =>
        `| \`${o.method.toUpperCase()} ${o.path}\` | ${o.operationId ?? '—'} | ${
          o.scopes.join(', ') || '—'
        } |`,
    )
    .join('\n')
  const tables = report.data.tables
    .map(
      (t) =>
        `- \`${t.name}\` — pk(${t.primaryKey.join(', ') || '?'}); ${t.columns.length} columns (${t.sourceFile})`,
    )
    .join('\n')
  const topics = report.events.topics
    .map((t) => `- \`${t.name}\` (${t.role}) — ${t.source}`)
    .join('\n')

  return `# Service Specification: ${report.service.name}

> Living specification. Source of truth for the **contract surface** of this service.
> Implementation lives in code; this document is what the code is continuously checked against.
> Update in the same PR as any contract change.

## 1. Purpose & responsibilities
${prose.purpose ?? '<!-- TODO: confirm purpose, what it owns, and the bounded context it does NOT own -->'}

## 2. API surface
Authoritative contract: \`${report.api.file ?? '<openapi file>'}\` (version ${report.api.version ?? '?'}).

| Method & path | operationId | Required scope |
|---|---|---|
${ops || '| — | — | — |'}

${prose.api ?? '<!-- TODO: confirm API standards: error format, idempotency, pagination, backward-compat policy -->'}

## 3. Domain model & state machine
${prose.stateMachine ?? '<!-- TODO: confirm the only legal states and transitions -->'}

## 4. Persistence
Discovered tables:
${tables || '- <none discovered>'}

${prose.persistence ?? '<!-- TODO: confirm isolation/retry rules, key strategy, migration policy -->'}

## 5. Eventing
Discovered topics:
${topics || '- <none discovered>'}

${prose.eventing ?? '<!-- TODO: confirm schemas + versions, delivery semantics, outbox rule, trace propagation -->'}

## 6. Security model
Resource server: ${report.security.resourceServer ? 'yes' : 'unknown'} · JWKS configured: ${
    report.security.jwksConfigured ? 'yes' : 'unknown'
  }
Discovered scopes: ${report.security.scopes.join(', ') || '<none>'}

${prose.security ?? '<!-- TODO: confirm authN, authZ scopes/roles + resource ownership, audit, data handling -->'}

## 7. Non-functional requirements / SLOs
${prose.nfr ?? '<!-- TODO: availability, latency, capacity, backward-compat -->'}

## 8. Observability baseline
${prose.observability ?? '<!-- TODO: required log fields, required metrics, required traces + propagation -->'}

## 9. Known deviations (as-is vs desired)
<!-- Where reality differs from the desired contract. Each entry: what, why, target. -->
${prose.deviations ?? '- none recorded yet'}

## 10. Conformance criteria
${prose.conformance ?? '<!-- TODO: C-1..C-n: how a check verifies the running service matches this spec -->'}
`
}

export function featureSpecBody(): string {
  return `# {{title}}

## 1. Context
<!-- current state; why this change -->

## 2. Objective
<!-- one paragraph: what the change achieves -->

## 3. Scope
In scope:
Out of scope:  <!-- anything unmentioned is governed by the base spec -->

## 4. Functional requirements
- FR-1

## 5. API contract delta
<!-- OpenAPI additions/changes only -->

## 6. Security
<!-- deltas to authZ; everything else inherits the base -->

## 7. Persistence
<!-- schema delta; follow base isolation/retry/key rules -->

## 8. Eventing
<!-- new/changed events; follow base outbox + schema rules -->

## 9. Non-functional requirements

## 10. Observability

## 11. Acceptance criteria (testable, Given/When/Then)
- AC-1: Given ... when ... then ...  [test: <test id>]

## 12. Edge cases & error handling

## 13. Rollout & migration

## 14. Base spec impact (amendments)
- [ ] none

## 15. Conformance checklist
- [ ] Stays within bounded context
- [ ] Standard error / idempotency / pagination conventions
- [ ] Respects the state machine
- [ ] Follows persistence rules
- [ ] Follows eventing/outbox/schema rules
- [ ] Honors the security model
- [ ] Meets the observability baseline

## 16. Implementation plan & task breakdown
`
}

export function featureFrontMatter(args: {
  id: string
  title: string
  base: string
  baseVersion: string
  owner: string
}): FrontMatter {
  const now = new Date().toISOString().slice(0, 10)
  return {
    id: args.id,
    title: args.title,
    status: 'Draft',
    base: args.base,
    baseVersion: args.baseVersion,
    owner: args.owner,
    created: now,
    updated: now,
  }
}

// ---- Spec lint ----

export interface LintIssue {
  level: 'error' | 'warn'
  message: string
}

export function lintFeatureSpec(fm: FrontMatter, body: string): LintIssue[] {
  const issues: LintIssue[] = []
  if (!fm.id) issues.push({level: 'error', message: 'missing front-matter: id'})
  if (!fm.status) issues.push({level: 'error', message: 'missing front-matter: status'})
  if (!fm.base || !fm.baseVersion)
    issues.push({level: 'error', message: 'must reference a base spec + version (base, baseVersion)'})

  const acLines = body
    .split('\n')
    .filter((l) => /\bAC-\d+\b/.test(l))
  if (acLines.length === 0)
    issues.push({level: 'error', message: 'no acceptance criteria (AC-n) found'})
  for (const line of acLines) {
    if (!/\[test:\s*\S+\]/i.test(line)) {
      const ac = line.match(/AC-\d+/)?.[0] ?? 'AC'
      issues.push({level: 'error', message: `${ac} is not linked to a test ([test: <id>])`})
    }
  }
  const frLines = body.split('\n').filter((l) => /\bFR-\d+\b/.test(l))
  if (frLines.length === 0) issues.push({level: 'warn', message: 'no functional requirements (FR-n) found'})
  return issues
}
