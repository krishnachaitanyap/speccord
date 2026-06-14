# Contributing to speccord

Thanks for your interest in improving speccord! This guide covers how to set up, the one design rule
that matters, and how to get a change merged.

## The one rule: deterministic decisions, model-written prose

speccord's whole value is that **pass/fail is decided by code, never by a model.** Keep that line:

- **Deterministic (code):** parsing/discovery, the contract-surface diff, the lifecycle state machine
  and entry gates, capability resolution, `analyze`/`lint`/`gate`/`conform`. These must be pure and
  predictable — no LLM calls in a path that decides whether something passes.
- **Model-written (prose only):** drafting narrative around facts the tool already established
  (plans, PRDs, stories, reviews). A persona must never invent endpoints, tables, topics, or scopes.

If a change blurs that boundary, it's probably the wrong shape — open an issue to discuss first.

## Development setup

```bash
git clone https://github.com/krishnachaitanyap/speccord.git
cd speccord
npm install
npm run build       # tsc -> dist/
npm run typecheck   # tsc --noEmit (must pass)
node ./bin/run.js --help     # run the CLI from source
```

Requirements: Node.js >= 18. An `ANTHROPIC_API_KEY` is optional — every command runs without it
(prose becomes deterministic skeletons), and the deterministic paths never need it.

## Project layout

```
src/
  commands/   # oclif commands (one file per command; topics are folders: base/, feature/, story/)
  lib/
    actions.ts        # reusable read/verify/transition actions (CLI + MCP share these)
    methodology.ts    # scale levels, phases, roles, capability model
    agents.ts         # agent personas
    config.ts         # config, packs, presets, capability resolution
    gate.ts           # CI drift-gate logic
    agentrules.ts     # agent-integration file generation
    discovery/ conformance/ llm/ spec/
docs/         # slides (deck), demo (interactive player)
```

See the **Architecture** and **Flows** diagrams in the [README](README.md) for how these fit together.

## Adding or changing a command

1. Add `src/commands/<name>.ts` (or under a topic folder). Follow the existing oclif style:
   `static description`, `static flags`, `static examples` using `<%= config.bin %>`.
2. Put real logic in `src/lib/` (ideally as an `action*` in `lib/actions.ts`) so the CLI, `--json`,
   and the **MCP server** (`src/commands/mcp.ts`) can all reuse it. Don't duplicate logic in commands.
3. If it's a verifier, add a `--json` flag and a matching MCP tool.
4. Gate it on a capability where appropriate (`capabilityOn(cfg, '...')`) so it respects the scale.

## Before you open a PR

Run speccord on itself where relevant, plus:

```bash
npm run typecheck      # must pass
npm run build          # must pass
# if you touched specs in a project:
node ./bin/run.js lint
node ./bin/run.js analyze <spec>
node ./bin/run.js gate --base origin/main
```

A change to the contract surface (parsers, command behavior, config schema) should update the docs in
the same PR — README/USAGE and, if the workflow changed, the deck (`docs/slides/build_slides.py`) and
the demo (`docs/demo/index.html`).

## Commit & PR conventions

- Small, focused commits with imperative subject lines (e.g. "Add story implement --execute loop").
- Describe the *why* in the body when it isn't obvious.
- PRs: explain the change, how you tested it, and any docs you updated. Link related issues.

## Reporting bugs / proposing features

Open a GitHub issue. For bugs, include the command you ran, what you expected, what happened, and
(if relevant) the `--json` output. For features, describe the problem first — especially how it keeps
the deterministic/prose boundary above.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
