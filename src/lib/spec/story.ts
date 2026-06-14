import type {FrontMatter} from './model.js'

// A story is the unit of story-driven development (BMAD). Its defining property
// is "context engineering": the story embeds everything a developer/agent needs
// to implement it with no other document open — the relevant requirements, the
// contract slice, dev notes, and testable acceptance criteria.

export const STORY_STATUSES = ['Draft', 'Ready', 'In Progress', 'Review', 'Done'] as const
export type StoryStatus = (typeof STORY_STATUSES)[number]

export const STORY_TRANSITIONS: Record<StoryStatus, StoryStatus[]> = {
  Draft: ['Ready'],
  Ready: ['In Progress', 'Draft'],
  'In Progress': ['Review', 'Ready'],
  Review: ['Done', 'In Progress'],
  Done: [],
}

export interface StoryFrontMatter extends FrontMatter {
  epic?: string
  feature?: string
  storyStatus?: StoryStatus
}

// The instruction given to the SM persona to draft the embedded-context body.
export const STORY_TASK =
  'Write ONE self-contained story. Include these sections exactly: ' +
  '"## Context (embedded — implement with no other doc open)", ' +
  '"## Acceptance criteria" (each as "- AC-n: Given/When/Then  [test: <id>]"), ' +
  '"## Dev notes" (contract slice, files likely touched, gotchas), and ' +
  '"## Tasks" (an ordered "- [ ] T-n ..." checklist). Keep it to one vertical slice.'

export function storySkeleton(title: string, body: string): string {
  return `# ${title}

${body}
`
}

// Deterministic body when no LLM is available — the structure, ready to fill.
export function storyPlaceholder(): string {
  return `## Context (embedded — implement with no other doc open)
<!-- TODO: paste the relevant requirement, contract slice, and constraints here. -->

## Acceptance criteria
- AC-1: Given ... when ... then ...  [test: <test id>]

## Dev notes
<!-- files likely touched, contract details, gotchas -->

## Tasks
- [ ] T-1 ...
`
}

export function storyFrontMatter(args: {
  id: string
  title: string
  epic?: string
  feature?: string
}): StoryFrontMatter {
  const now = new Date().toISOString().slice(0, 10)
  return {
    id: args.id,
    title: args.title,
    epic: args.epic,
    feature: args.feature,
    storyStatus: 'Draft',
    created: now,
    updated: now,
  }
}
