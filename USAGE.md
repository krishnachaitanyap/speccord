# speccord — How to use

A practical, end-to-end guide. For a fast overview see the [README](README.md). This document
explains the mental model, the one knob you actually tune (**scale**), then walks three complete
tutorials — **brownfield**, **greenfield**, and a **product/BMAD-style** run — followed by reference
material and troubleshooting.

---

## Table of contents

1. [The mental model](#1-the-mental-model)
2. [Install & first run](#2-install--first-run)
3. [The one knob: scale, capabilities, and packs](#3-the-one-knob-scale-capabilities-and-packs)
4. [Core concepts](#4-core-concepts)
5. [Agent personas](#5-agent-personas)
6. [Tutorial A — Brownfield: spec an existing service](#6-tutorial-a--brownfield-spec-an-existing-service)
7. [Tutorial B — Greenfield: build a new service from a spec](#7-tutorial-b--greenfield-build-a-new-service-from-a-spec)
8. [Tutorial C — Product/BMAD: brief → PRD → stories → ship](#8-tutorial-c--productbmad-brief--prd--stories--ship)
9. [The feature workflow in depth](#9-the-feature-workflow-in-depth)
10. [Enforcement: lint, gates, the lifecycle, conform](#10-enforcement-lint-gates-the-lifecycle-conform)
11. [Configuration reference](#11-configuration-reference)
12. [Wiring it into CI](#12-wiring-it-into-ci)
13. [Working without an API key](#13-working-without-an-api-key)
14. [Troubleshooting & FAQ](#14-troubleshooting--faq)
15. [Integrating with AI agents](#15-integrating-with-ai-agents)
16. [Discovery: stacks & custom providers](#16-discovery-stacks--custom-providers)

---

## 1. The mental model

speccord keeps one promise: **the spec is the contract the code is checked against, and it never
silently falls out of sync.** It fuses three lineages into one CLI:

- **spec-kit** — the generative chain: constitution → spec → plan → tasks → implement.
- **speccord** — the deterministic spine: discover existing code, lifecycle gates, CI drift gate,
  runtime conformance.
- **BMAD-METHOD** — agentic agile: role personas, a scale-adaptive process, and a PRD → epics →
  context-engineered stories hierarchy with story-driven development.

It is "hybrid by construction":

- **Facts and decisions are deterministic.** Parsing, diffing the contract surface, the lifecycle
  state machine, the gates, capability resolution — all plain code with predictable output.
- **Only prose is model-written.** Personas and drafters write narrative around facts the tool
  already established; they never invent an endpoint, table, or scope.

The four phases (from BMAD) and where each command lives:

```
ANALYSIS            PLANNING              SOLUTIONING            IMPLEMENTATION
brief (analyst)     prd (pm)              base spec (architect)  story new (sm)
discover            base draft|new        plan / epics           implement (dev)
                    feature new, clarify  agent architect        tasks, review (qa)
                                                                 advance · gate · conform
```

You don't have to run all four — **scale** decides which are active.

---

## 2. Install & first run

```bash
cd speccord
npm install
npm run build
npm link            # puts `speccord` on your PATH (or call ./bin/run.js)
speccord --help
speccord <command> --help
```

Optional — enable drafting and personas:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export SPECCORD_MODEL=claude-sonnet-4-6   # optional; default
```

Everything works without a key; prose is replaced by deterministic skeletons (see [§13](#13-working-without-an-api-key)).

---

## 3. The one knob: scale, capabilities, and packs

This is the "clear capability usage, configurable from the user's perspective." You set **how much
process** with a single number and the rest derives from it.

### Scale (0–4)

```bash
speccord init --service orders --scale 2
speccord capabilities --scales
```

| Scale | Name | Active phases | What it adds |
|---|---|---|---|
| 0 | prototype | implementation | conformance only — no ceremony |
| 1 | small | planning, implementation | architecture, stories, lifecycle, CI gate |
| 2 | medium *(default)* | + solutioning | PRD, QA review |
| 3 | large | + analysis | ideation (brief), UX |
| 4 | enterprise | all | product owner (PO) + compliance gates |

### Capabilities

Each capability is an independent on/off that the scale sets a default for, and you can override:

```bash
speccord capabilities          # shows scale, active phases, enabled roles, and every capability:
                              #   on/off, which phase it belongs to, and which commands it unlocks
```

```
Capabilities:
  [x] ideation      analysis       → brief
  [x] prd           planning       → prd
  [x] architecture  solutioning    → discover, base draft|new, plan
  [ ] ux            planning       → agent ux
  [x] epicsStories  implementation → story new|list|next|advance, implement
  [x] qaReview      implementation → review, agent qa
  [x] lifecycle     implementation → advance, status, lint
  [x] conformance   implementation → conform
  [x] ciGate        implementation → gate
```

A command whose capability is off refuses to run and tells you how to enable it. To override, edit
`speccord.config.yaml`:

```yaml
capabilities:
  ux: true              # turn one capability on regardless of scale
```

### Packs

A pack bundles a scale + a gate policy — the "how do you want to work" shortcut:

```bash
speccord init --pack product       # scale 3 (ideation+PRD+UX+stories)
speccord capabilities --packs
```

| Pack | Scale | Gate policy |
|---|---|---|
| `service-brownfield` | 2 medium | standard |
| `service-greenfield` | 1 small | lite |
| `product` | 3 large | standard |
| `enterprise` | 4 enterprise | compliance |
| `prototype` | 0 prototype | lite |

`--scale` always overrides the pack's default scale; explicit `capabilities`/`customization` keys in
your config always win over both.

---

## 4. Core concepts

| Term | What it is |
|---|---|
| **Scale** | 0–4. Sets active phases, enabled roles, and default capabilities. |
| **Capability** | An on/off feature (ideation, prd, ux, epicsStories, qaReview, conformance, …). |
| **Pack** | A named bundle of scale + gate policy. |
| **Constitution** | The project's non-negotiable principles (`P-n`). Plans are checked against it. |
| **Brief** | Analyst output: problem/users/goals/risks for a raw idea. |
| **PRD** | Product Requirements Document: product intent + prioritized **epics**. |
| **Base spec** | The service-level *technical contract*: API, state machine, persistence, eventing, security, NFRs, observability. Satisfies the PRD. |
| **Feature spec** | A change to the service. `FR-n` + testable `AC-n` (each linked to a test). |
| **Story** | A context-engineered, self-contained unit of dev work, sharded from an epic/feature. |
| **Artifacts** | A feature spec's siblings: `*.plan.md`, `*.tasks.md`, `*.checklist.md`, `*.prompts.md`. |
| **Baseline** | `.speccord/baseline.json` — the accepted contract surface `conform` diffs against. |
| **Lifecycle** | Spec: `Draft→In Review→Approved→In Implementation→Implemented→Superseded`. Story: `Draft→Ready→In Progress→Review→Done`. |

Markers (checked by `lint`/`analyze`): `FR-1`, `AC-1: Given/When/Then [test: SomeTest]`,
`[NEEDS CLARIFICATION: …]`, `EPIC-1` (in the PRD), `P-1` (constitution).

---

## 5. Agent personas

BMAD's "agents as expert collaborators," expressed for a CLI: each role is an **inspectable prompt**,
not a hidden chat. The deterministic commands (`plan`, `tasks`, `story new`, `prd`, `review`) already
invoke the right persona internally; `agent` lets you run any persona ad hoc.

```bash
speccord agent list                                        # who's enabled at this scale
speccord agent qa        --input specs/features/SPEC-1-*.md # adversarial review to stdout
speccord agent architect --input specs/base/orders.md --task "propose 4 epics" --out epics.md
speccord agent analyst   --input specs/brief.md --task "list the riskiest assumptions"
```

Roles: `analyst`, `pm`, `ux`, `architect`, `sm`, `dev`, `qa`, `po`. Which are "on" reflects
`methodology.roles` for your scale, but you can run any role ad hoc (with a warning).

---

## 6. Tutorial A — Brownfield: spec an existing service

**Goal:** take an existing Spring Boot service and produce a base spec it is checked against. Run
from the service repo root.

```bash
speccord init --service orders                 # scale 2 default; or --pack service-brownfield
speccord capabilities                          # confirm what's on
```

### Discover the as-is surface

```bash
speccord discover                              # -> .speccord/discovery-report.json
```

Reports operations, tables, topics, scopes. Understands OpenAPI, Flyway migrations, Kafka
(`@KafkaListener`/`KafkaTemplate.send`), and Spring Security (`@PreAuthorize`, `SCOPE_*`,
resource-server/JWKS).

### Review, confirm, generate

```bash
speccord base draft        # interactive: confirm facts, correct names, record deviations
speccord base draft --yes  # accept as-is;  add --no-llm to skip prose drafting
```

Writes `specs/base/orders.md` (status `Draft`) and snapshots `.speccord/baseline.json`. Resolve the
`TODO`s in the spec, then prove enforcement works:

```bash
speccord conform           # CONFORMANT
# change an endpoint in the OpenAPI file...
speccord conform           # NOT CONFORMANT — drift reported, exit 1
```

From here every change goes through the [feature workflow](#9-the-feature-workflow-in-depth).

---

## 7. Tutorial B — Greenfield: build a new service from a spec

**Goal:** start from nothing, design the contract first, then implement against it.

```bash
mkdir giftcards && cd giftcards
speccord init --service giftcards --greenfield      # or --pack service-greenfield (lighter)
speccord base new --intent "Issue and redeem gift cards; owns balances; called by checkout to debit, by support to refund."
```

`base new` drafts the **target** spec from intent; the fact tables (API/persistence/eventing) start
**empty** and fill in as features land. It writes an empty baseline.

```bash
speccord constitution        # author principles  (edit them)
```

Run the [feature workflow](#9-the-feature-workflow-in-depth) for your first capability. In greenfield
`implement` is how code first appears (prompt pack, or `--execute` to drive a configured agent).

Once code exists, establish the real baseline:

```bash
speccord discover
speccord conform --update-baseline    # accept the now-real surface; ensure the base spec documents it
```

From here it behaves like any brownfield service.

> Tip: greenfield starts at `lite`/scale 1 so the plan+tasks gate doesn't slow you down. Raise the
> scale (`methodology.scale`) as the service matures.

---

## 8. Tutorial C — Product/BMAD: brief → PRD → stories → ship

**Goal:** a larger initiative where you want analysis, product requirements, and story-driven dev.
Use scale 3+ (the `product` pack).

```bash
speccord init --service giftcards --pack product    # scale 3: analysis+planning+solutioning+impl
speccord capabilities                               # ideation, prd, ux, epicsStories, qaReview all on
```

### Analysis → Planning

```bash
speccord brief --idea "A gift-card platform: issue, redeem, refund, with fraud limits"   # analyst
speccord prd                                          # PM: PRD with prioritized EPIC-n list
speccord prd --validate                               # PO reviews the PRD for gaps
```

### Solutioning

```bash
speccord base new --intent "..."                      # architect: the technical contract
speccord agent architect --input specs/base/giftcards.md --task "propose epics & their stories"
```

### Implementation — story-driven loop

```bash
speccord story new --epic EPIC-1 --title "Issue a card"   # SM drafts a context-engineered story
speccord story list                                       # the board: id / status / epic / title
speccord story next                                       # the next story to pick up
speccord story advance specs/stories/STORY-1-*.md --to "In Progress"
speccord story implement specs/stories/STORY-1-*.md       # dev: prompt pack, or --execute to drive agent+tests
speccord review specs/stories/STORY-1-*.md --lens edge-cases   # QA: adversarial / edge-cases / tests
speccord story advance specs/stories/STORY-1-*.md --to Done
```

`story implement` is the story-driven dev loop: by default it writes a `*.prompts.md` pack (one
grounded dev prompt per task); with `--execute` (and `implement.agentCommand`/`testCommand` set) it
drives the agent task-by-task, runs the tests after each, checks the box only on green, and moves the
story to **Review** when all tasks pass. Because the story is already context-engineered, each prompt
is self-contained.

A **story** embeds everything needed to implement it (the requirement, the contract slice, dev notes,
and Given/When/Then ACs linked to tests) — so a developer or coding agent needs no other document
open. That's BMAD's context engineering, grounded in your speccord contract.

---

## 9. The feature workflow in depth

Identical across modes. Example: "Order cancellation".

```bash
speccord feature new --id SPEC-142 --title "Order cancellation"   # Draft, pinned to base version
speccord clarify   specs/features/SPEC-142-order-cancellation.md  # resolve [NEEDS CLARIFICATION] (--llm to detect)
speccord plan      specs/features/SPEC-142-order-cancellation.md  # -> *.plan.md, grounded in base + constitution
speccord tasks     specs/features/SPEC-142-order-cancellation.md  # -> *.tasks.md, ordered checklist
speccord analyze   specs/features/SPEC-142-order-cancellation.md  # deterministic: spec↔plan↔tasks↔constitution
speccord checklist specs/features/SPEC-142-order-cancellation.md  # readiness checklist (--check to verify)
speccord advance   specs/features/SPEC-142-order-cancellation.md --to Approved
speccord implement specs/features/SPEC-142-order-cancellation.md  # prompt pack, or --execute agent+tests
speccord review    specs/features/SPEC-142-order-cancellation.md --lens tests
```

Notes:
- Pass the **exact spec file**, not a glob — `SPEC-142-*.md` also matches the generated
  `SPEC-142-*.plan.md` siblings and would feed two paths to single-file commands.
- `analyze` is pure code: it flags open clarifications, untested `AC-n`, `AC-n` no task covers, tasks
  referencing a non-existent `AC-n`, and plans that ignore the constitution.
- `implement --execute` needs `implement.agentCommand` + `implement.testCommand` configured; it runs
  each task, then the tests, and checks the box only when they pass.

---

## 10. Enforcement: lint, gates, the lifecycle, conform

Four independent checks; use them together.

- **`speccord lint`** — feature specs are structurally valid (front-matter, base ref, every `AC-n`
  linked to a test).
- **The lifecycle (`advance`)** — you cannot enter a status until its entry gate passes; transitions
  are fixed. Gates configurable via preset/customization (Approved: lint + base ref [+ checklist, no
  open clarifications under `compliance`]; In Implementation: ACs tested + plan + tasks exist).
- **`speccord gate --base <ref>`** — CI drift gate: a contract-surface file changed without a spec in
  the same diff fails the build.
- **`speccord conform`** — runtime drift: re-discovers and diffs the live surface against the baseline,
  then runs configured contract checks. `--update-baseline` accepts the current surface.

Stories have their own lightweight machine (`story advance`): `Draft → Ready → In Progress → Review →
Done`.

---

## 11. Configuration reference

`speccord.config.yaml` (created by `init`):

```yaml
service: orders
baseSpec: specs/base/orders.md
constitution: specs/constitution.md
prdPath: specs/prd.md
specsDir: specs
featuresDir: specs/features
storiesDir: specs/stories

# Files that ARE the contract surface — `gate` fails if one changes without a spec change.
contractSurface:
  - "**/openapi*.{yaml,yml,json}"
  - "**/db/migration/**/*.sql"
  - "**/resources/**/V*__*.sql"
  - "**/*SecurityConfig*.java"

# Methodology: the process knob. Scale reshapes phases/roles/capability defaults.
methodology:
  scale: 2                       # 0..4
  phases: [planning, solutioning, implementation]
  roles:  [pm, architect, sm, dev, qa]

# Capabilities: independent on/off (defaults derive from scale; edits here win).
capabilities:
  ideation: false
  prd: true
  architecture: true
  ux: false
  epicsStories: true
  qaReview: true
  lifecycle: true
  conformance: true
  ciGate: true

# Gate policy (a preset is a named bundle; explicit keys win).
preset: standard                 # standard | compliance | lite
customization:
  requirePlanForImplementation: true
  # requireChecklistForApproval: true
  # blockOnOpenClarifications: true

# Optional: a pack bundles scale + preset.
# pack: product

# Runtime conformance.
conformance:
  checkStructuralDrift: true
  checks:
    - name: contract-tests
      run: "./mvnw -q test -Dtest=*ContractTest"

# Optional: drive coding/LLM agents.
implement:
  agentCommand: "claude -p"      # receives each task prompt on stdin
  testCommand: "./mvnw -q test"  # run after each task; a task is only checked off if this passes
agents:
  command: "claude -p"           # (reserved) default command for persona execution
```

**Resolution order** (later wins): scale defaults → pack → preset → your explicit keys. So changing
one `methodology.scale` number reshapes everything, but any field you set by hand is sacred.

Environment: `ANTHROPIC_API_KEY` (enables drafting/personas), `SPECCORD_MODEL` (model id).

---

## 12. Wiring it into CI

```yaml
# .github/workflows/spec.yml (sketch)
steps:
  - uses: actions/checkout@v4
    with: {fetch-depth: 0}                                  # gate needs history
  - run: npm ci && npm run build
  - run: speccord lint
  - run: speccord gate --base origin/${{ github.base_ref }}  # contract change ⇒ spec change
  - run: speccord analyze specs/features/CHANGED-spec.md      # artifacts agree (per changed spec)
  - run: speccord conform                                     # live surface matches the baseline
```

`gate` is the cheapest, highest-value check — add it first. `conform` is most useful where the
service is actually built. Treat any non-zero exit as "spec and code disagree — fix one".

---

## 13. Working without an API key

Every command runs without `ANTHROPIC_API_KEY`; only prose/persona output is replaced by
deterministic skeletons or stubs:

| Command | With key | Without key |
|---|---|---|
| `base draft` / `base new`, `prd`, `plan`, `tasks`, `checklist`, `brief` | drafted prose | structured skeletons / `TODO`s |
| `story new` | SM-drafted, context-engineered body | the story structure to fill in |
| `agent <role>`, `review` | persona output | a stub naming the persona + task |
| `clarify --llm` | model flags ambiguities | (omit `--llm`) resolve existing markers only |
| `discover`, `analyze`, `lint`, `gate`, `conform`, `advance`, `status`, `capabilities`, `story list/next/advance` | identical — pure code |

The deterministic guarantees never depend on a key.

---

## 14. Troubleshooting & FAQ

**A command says a capability is off.**
That capability isn't enabled at your scale. Run `speccord capabilities` to see the map, then either
set `capabilities.<name>: true` in config or raise `methodology.scale`.

**`init --pack X` didn't change my scale.**
Packs set the *default* scale; an explicit `--scale` (or a `methodology.scale` already in your config)
overrides it. Check with `speccord capabilities`.

**`discover` finds 0 operations / 0 tables.**
Files aren't matched by the default globs. OpenAPI must declare `openapi:`/`swagger:`; migrations must
look like `V1__init.sql` or live under `db/migration/`. Inspect with `speccord discover --json`.

**`advance --to "In Implementation"` is blocked.**
Needs every `AC-n` linked to a test, plus a plan + tasks. Run `plan` then `tasks`, add `[test: …]` to
each AC. (`lite`/scale ≤1 drops the plan/tasks requirement.)

**A single-file command errors with "Unexpected argument".**
You passed a glob (`SPEC-1-*.md`) that matched the spec *and* its generated siblings. Pass the exact
spec filename.

**`conform` says NOT CONFORMANT right after `base new` (greenfield).**
Expected — the baseline is empty and new code adds surface. Run `conform --update-baseline` once the
code reflects the intended contract, and make sure the base spec documents it.

**Can I edit generated specs/stories by hand?**
Always. speccord generates structure and drafts; you own the content. Regenerating needs `--force` so
it never clobbers edits silently.

**Brownfield vs greenfield vs product — which do I pick?**
Brownfield if code exists; greenfield if not; the `product` pack (scale 3) when you want
ideation/PRD/UX on top. It stops mattering once the base spec exists — every command past that point
behaves the same.

---

## 15. Integrating with AI agents

speccord is designed to be the **contract layer** a coding agent plugs into: the agent generates,
speccord verifies (deterministically), and the agent loops until the gates pass. There are three
integration tiers — pick what fits.

### One-time setup

```bash
speccord agent-rules                 # wires up Claude Code + Cursor + Copilot
speccord agent-rules --tool cursor   # only one
speccord agent-rules --command "node ./bin/run.js"   # if `speccord` isn't on PATH
```

This writes, per tool, an MCP server config and a spec-as-contract ruleset:

| Tool | MCP config | Rules file |
|---|---|---|
| Claude Code | `.mcp.json` | `CLAUDE.md` |
| Cursor | `.cursor/mcp.json` | `.cursor/rules/speccord.mdc` |
| Copilot / VS Code | `.vscode/mcp.json` | `.github/copilot-instructions.md` |

Existing files are skipped unless `--force`. Restart the agent so it loads the MCP config. If you
installed speccord with `npm link` (or globally) the default `speccord` command resolves; otherwise
pass `--command`.

### Tier 1 — Agent → speccord over MCP (recommended)

`speccord mcp` runs an MCP server on stdio. Once `agent-rules` has written the config, the agent gets
speccord as native tools:

- **read (ground truth):** `speccord_get_base_spec`, `speccord_get_constitution`, `speccord_get_file`,
  `speccord_capabilities`, `speccord_status`, `speccord_stories`, `speccord_story_next`
- **verify (the gates):** `speccord_analyze`, `speccord_lint`, `speccord_gate`, `speccord_conform`,
  `speccord_discover`
- **transition:** `speccord_advance`, `speccord_story_advance`, `speccord_update_baseline`

The ruleset tells the agent the protocol: read the spec before coding, stay inside the contract,
update the spec in the same change if the contract must change, then run the verify tools and fix
until they pass before advancing the lifecycle. Verify it's alive:

```bash
speccord mcp        # prints "speccord MCP server: ready on stdio" then waits (Ctrl-C to exit)
```

### Tier 2 — Agent → speccord over the CLI (`--json`)

For agents/CI that shell out instead of speaking MCP, every verifier emits machine-readable JSON:

```bash
speccord analyze specs/features/SPEC-1-*.md --json
speccord lint --json
speccord gate --json
speccord conform --json
speccord status --json
```

Each exits non-zero on failure and prints a structured result (findings, drift, pass/fail) the agent
can parse and act on.

### Tier 3 — speccord → agent (the dev loop)

speccord drives the agent, owning the loop and the gate. Configure a command that takes a prompt on
stdin and a test command:

```yaml
implement:
  agentCommand: "claude -p"        # or: cursor-agent, aider --message-file -, codex ...
  testCommand: "./mvnw -q test"
```

Then:

```bash
speccord implement specs/features/SPEC-1-*.md --execute     # feature tasks
speccord story implement specs/stories/STORY-1-*.md --execute  # a context-engineered story
```

speccord feeds each task's grounded prompt to the agent, runs the tests, and checks the box only on
green — moving the story to **Review** when all tasks pass.

### The loop, end to end

```
agent reads spec/story  (speccord_get_* )      →  writes code
        ↓                                            ↓
   speccord_analyze / _lint / _gate / _conform  ← ─ verify (JSON / MCP)
        ↓ fail → findings back to the agent → fix → repeat
        ↓ pass
   speccord_advance / _story_advance              (transition)
```

Because pass/fail is deterministic, the agent can move fast and be wrong — the gates catch contract
drift on every iteration, which is the whole point.

### Tips

- **Keep the agent inside the contract.** The ruleset says it, but the real enforcement is
  `speccord_gate` + `speccord_conform`: a contract change without a spec change fails, every time.
- **Run the MCP server from the repo root** — it reads `speccord.config.yaml`, `specs/`, and
  `.speccord/` relative to the launch directory (the agent sets this to the workspace).
- **CI uses the same checks** the agent does (`gate`, `conform`, `lint`, `analyze`), so "passes
  locally for the agent" and "passes CI" are the same bar.

---

## 16. Discovery: stacks & custom providers

`speccord discover` is a **provider registry**, not a single parser. It detects your stack (from
marker files like `pom.xml`, `package.json`, `go.mod`, `pyproject.toml`) and runs the applicable
providers, merging their facts into one report. The rest of speccord (gates, `conform`, lifecycle)
is stack-agnostic — it only reads the normalized report.

Built-in providers today: `openapi`, `sql-migrations`, `kafka`, `spring-security`. (More universal
ones — GraphQL, Protobuf, AsyncAPI, Prisma — are on the [roadmap](ROADMAP.md).)

### Enterprise: teach speccord your own frameworks (no fork)

Configure discovery under `discovery:` in `speccord.config.yaml`. Three levers:

```yaml
discovery:
  disable: [kafka]                 # turn off a built-in provider by name

  # 1) Declarative custom providers — pull facts out of proprietary files with regex.
  custom:
    - name: acme-rpc
      kind: api                    # api | data | events | security (a label)
      files: ["**/*.acme"]         # globs to scan
      operations:                  # capture API operations
        match: "rpc\\s+(\\S+)\\s+(\\S+)"
        methodGroup: 1             # which capture group is the HTTP method
        pathGroup: 2               # which is the path
        idGroup: 3                 # (optional) operationId
      tables: { match: "entity\\s+(\\w+)", nameGroup: 1 }       # capture data tables
      topics: { match: "channel\\s+(\\S+)", nameGroup: 1, role: produces }  # capture events
      scopes: { match: "scope\\s+(\\S+)", group: 1 }            # capture auth scopes
      resourceServerWhen: "@Secured"                            # presence => resourceServer=true

  # 2) Code plugins — for anything too complex for regex.
  plugins: ["./speccord-providers/internal.js"]   # exports a DiscoveryProvider[] (default or `providers`)
```

A plugin module:

```js
// speccord-providers/internal.js
export default [{
  name: 'internal-rpc',
  kind: 'api',
  async detect({ root }) { /* return true/false */ return true },
  async discover({ root, stack }) {
    // ...parse however you like...
    return { api: { operations: [{ method: 'post', path: '/widgets', scopes: [] }] } }
  },
}]
```

Notes:
- Custom-provider facts merge with built-in ones (operations de-duped by `METHOD path`, tables by
  name, topics by `name:role`). Declarative-source facts (e.g. an OpenAPI file) win on `file`/`version`.
- `kind` is just a label; a provider may emit any surface (a single rule block can capture
  operations *and* tables *and* scopes, as the `acme-rpc` example does).
- Discovery facts are still **confirmed by a human in `base draft`** before they become the
  baseline — the hybrid invariant holds: tools propose, you ratify, code enforces.
