// Product Requirements Document: the product-level artifact above the base spec.
// In speccord's model the base spec is the *technical contract/architecture*; the
// PRD is the *product intent* that the base spec and features serve. Epics live
// here and are sharded into stories.

export function prdSkeleton(product: string, body: string): string {
  return `# PRD: ${product}

> Product Requirements Document. The product-level source of intent. Epics here are
> sharded into context-engineered stories (\`speccord story new\`). The base spec is the
> technical contract that satisfies this PRD.

${body}
`
}

export const PRD_SECTIONS = `Produce these sections as GitHub-flavored Markdown:

## 1. Problem & goals
The problem, who has it, and the goals (with measurable success metrics).

## 2. Users & personas
Primary users and what each needs.

## 3. Scope
In scope / Out of scope — be explicit about boundaries.

## 4. Epics (prioritized)
A numbered, prioritized list. One line each: "- EPIC-1: <title> — <one-line outcome>".

## 5. Risks & open questions
Use [NEEDS CLARIFICATION: ...] for anything undecided.`

export function prdPlaceholder(): string {
  return PRD_SECTIONS.replace(
    /^(##.*)$/gm,
    '$1\n<!-- TODO: draft (no LLM). Use --llm to have the PM draft this. -->',
  )
}

// Parse the prioritized epic lines out of a PRD.
export interface Epic {
  id: string // EPIC-1
  title: string
}

export function parseEpics(prd: string): Epic[] {
  const epics: Epic[] = []
  for (const line of prd.split('\n')) {
    const m = line.match(/^\s*-\s*(EPIC-\d+)\s*:\s*(.+?)(?:\s+—.*)?$/)
    if (m) epics.push({id: m[1], title: m[2].trim()})
  }
  return epics
}
