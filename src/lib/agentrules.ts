// The shared ruleset that teaches a coding agent the speccord contract, plus the
// per-tool integration files (MCP server config + rules) for Claude Code,
// Cursor, and Copilot/VS Code.

export const RULES_BODY = `# Working with speccord

This project uses **speccord**: the spec is the executable contract the code is checked against.
Whether something passes is decided by speccord (deterministic commands / MCP tools), not by your
judgment. Your job is to generate; speccord verifies.

## Before you write code
1. Read the contract and the principles first:
   - the **base spec** — the API / data / event / security contract
   - the **constitution** — non-negotiable principles (P-n)
   - the **feature spec or story** you are implementing
   Use MCP tools \`speccord_get_base_spec\`, \`speccord_get_constitution\`, \`speccord_get_file\`,
   \`speccord_story_next\` (or run \`speccord status\` / \`speccord story next\`).
2. Stay inside the contract. Do NOT add or change endpoints, DB tables, Kafka topics, or auth
   scopes that the spec does not describe.

## If a change really needs a new contract element
Update the spec in the SAME change — the base spec for service-level contract, or the feature
spec's delta sections — or the gate will fail the build. Never change the contract silently to
match code.

## After you write code — verify, then iterate until green
Run these and fix everything they report before you consider the task done:
- \`speccord analyze <spec>\`  (MCP: \`speccord_analyze\`) — spec ↔ plan ↔ tasks ↔ constitution
- \`speccord lint\`            (MCP: \`speccord_lint\`)    — front-matter, AC↔test linkage
- \`speccord gate\`            (MCP: \`speccord_gate\`)    — contract changed ⇒ spec changed
- \`speccord conform\`         (MCP: \`speccord_conform\`) — running code matches the baseline
A non-zero result means the spec and the code disagree. Fix one of them. Do not bypass the gate.

## Lifecycle
Advance specs with \`speccord advance <spec> --to <status>\` (MCP: \`speccord_advance\`) and stories
with \`speccord story advance\`. Entry gates are enforced — satisfy them, don't work around them.

## Acceptance criteria
Every acceptance criterion (AC-n) must be Given/When/Then and linked to a test: \`[test: <id>]\`.
Implement to make those tests pass.
`

export function cursorRules(): string {
  return `---
description: speccord — the spec is the contract the code is checked against
alwaysApply: true
---

${RULES_BODY}`
}

// MCP server launch config. command is split on spaces; "mcp" is appended.
export function mcpServerEntry(command: string): {command: string; args: string[]} {
  const tokens = command.trim().split(/\s+/)
  return {command: tokens[0], args: [...tokens.slice(1), 'mcp']}
}

export function claudeOrCursorMcpJson(command: string): string {
  return JSON.stringify({mcpServers: {speccord: mcpServerEntry(command)}}, null, 2) + '\n'
}

// VS Code (Copilot agent mode) uses the "servers" key.
export function vscodeMcpJson(command: string): string {
  return JSON.stringify({servers: {speccord: mcpServerEntry(command)}}, null, 2) + '\n'
}

export interface GenFile {
  path: string
  content: string
}

export function filesForTool(tool: 'claude' | 'cursor' | 'copilot', command: string): GenFile[] {
  if (tool === 'claude')
    return [
      {path: '.mcp.json', content: claudeOrCursorMcpJson(command)},
      {path: 'CLAUDE.md', content: RULES_BODY},
    ]
  if (tool === 'cursor')
    return [
      {path: '.cursor/mcp.json', content: claudeOrCursorMcpJson(command)},
      {path: '.cursor/rules/speccord.mdc', content: cursorRules()},
    ]
  return [
    {path: '.vscode/mcp.json', content: vscodeMcpJson(command)},
    {path: '.github/copilot-instructions.md', content: RULES_BODY},
  ]
}
