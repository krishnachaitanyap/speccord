import {readFile} from 'node:fs/promises'

// The constitution is the project's non-negotiable principles — the guardrails
// every plan, task breakdown, and review is checked against. It is authored by
// humans (not generated from code) and fed as context into the generative
// commands so plans inherit the project's standards.
export function constitutionTemplate(service: string): string {
  return `# Constitution: ${service}

> Non-negotiable principles for this service. Plans, tasks, and reviews are
> checked against these. Amend deliberately; every amendment is a contract change.

## Principles

### P-1: Contract-first
The OpenAPI/event/schema contract is the source of truth. Code conforms to the
published contract; the contract is never changed silently to match code.

### P-2: Backward compatibility
No breaking change to a published contract without a versioned migration and a
deprecation window. Additive-only by default.

### P-3: Test-backed acceptance
Every acceptance criterion links to at least one automated test before any code
is written. Tests are written against the spec, not the implementation.

### P-4: Bounded context
The service only owns what its base spec says it owns. Cross-context behaviour
goes through published contracts, never shared tables.

### P-5: Observable by default
Every new endpoint and consumer emits the required structured logs, metrics, and
traces defined in the base spec's observability baseline.

### P-6: Security is not optional
AuthN/authZ scopes and resource-ownership checks are part of the acceptance
criteria, never a follow-up.

<!-- Add project-specific principles below. Reference them in specs as [P-n]. -->

## Governance

- Amendments to this constitution require review by the service owners.
- A plan that violates a principle must record an explicit, reviewed exception
  in its "Constitution check" section — silent violations fail \`speccord analyze\`.
`
}

export async function loadConstitution(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

// Principle ids declared in the constitution (e.g. "P-1"), used by `analyze`.
export function constitutionPrinciples(text: string): string[] {
  return [...new Set([...text.matchAll(/\bP-\d+\b/g)].map((m) => m[0]))].sort()
}
