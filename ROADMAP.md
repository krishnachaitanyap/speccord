# speccord roadmap

Two workstreams to close the gap with the AI-native spec tools (spec-kit, Kiro, BMAD, Tessl):
**(A) make discovery stack-agnostic**, and **(B) make agent integration best-in-class** — plus
first-class **enterprise extensibility** so large orgs can teach speccord their own frameworks.

The enforcement spine (lifecycle, gates, `conform`, the actions layer, the MCP server) is already
stack-neutral — it operates on a normalized `DiscoveryReport`. Only discovery needed to open up.

## Workstream A — stack-agnostic discovery

Discovery is now a **provider registry**: the contract surface is universal, only the *sources* that
reveal it differ per stack. Each provider detects one kind of source and emits facts that merge into
the report.

- [x] **A1 — provider architecture** (`lib/discovery/provider.ts`, `registry.ts`, `stack.ts`,
  `builtin.ts`): stack detection + the four original parsers moved behind the interface.
  Behavior-preserving.
- [x] **Enterprise extensibility** (`lib/discovery/custom.ts`): declarative custom providers + code
  plugins, configured under `discovery:` (see USAGE §16). Disable builtins by name.
- [ ] **A2 — universal declarative providers**: GraphQL SDL, Protobuf, AsyncAPI, generic SQL DDL
  (Liquibase/Alembic/Rails/Knex), Prisma/Drizzle schema. This is where speccord becomes genuinely
  language-agnostic for most services out of the box.
- [ ] **A3 — framework adapters**: Node (Express/Nest), Python (FastAPI/Flask), Go, Rails routes.
- [ ] **A4 — agnostic fallback**: LLM-propose → human-confirm extraction for the long tail (stays
  within the hybrid invariant: model proposes, human ratifies, code enforces).

## Workstream B — agent integration

- [ ] **B1 — full MCP surface**: expose specs/constitution/stories as MCP **resources**, ship MCP
  **prompts** ("implement next story", "fix drift"), add a `speccord_next_action` tool and the story
  dev-loop tools.
- [ ] **B2 — broaden targets**: `agent-rules` for Windsurf, Cline, Continue, Aider, Zed, Gemini CLI,
  Codex CLI, Amazon Q, Roo, JetBrains AI — plus slash-command/prompt files where supported.
- [ ] **B3 — hooks**: `speccord hooks install` wires git pre-commit/pre-push to `gate`/`lint`/`conform`.
- [ ] **B4 — anti-hallucination `guard`**: a deterministic verifier that flags code referencing
  endpoints/tables/topics/scopes **not in the spec** ("no undocumented surface").
- [ ] **B5 — `agent-init`**: detect installed agents, wire them all, install hooks, smoke-test MCP.

## Sequencing

PR1 (A1 + enterprise) ✅ → PR2 (B1) → PR3 (A2) → PR4 (B2+B3) → PR5 (A4+B4).
