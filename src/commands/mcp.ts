import {Command} from '@oclif/core'
import {McpServer, ResourceTemplate} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {z} from 'zod'
import {loadConfig} from '../lib/config.js'
import {
  actionAnalyze,
  actionCapabilities,
  actionConform,
  actionDiscover,
  actionGate,
  actionLint,
  actionMarkTask,
  actionNextAction,
  actionStatus,
  actionStories,
  actionStoryNext,
  actionStoryTasks,
  actionStoryAdvance,
  actionAdvance,
  actionUpdateBaseline,
  readFileSafe,
} from '../lib/actions.js'

type ToolResult = {content: {type: 'text'; text: string}[]; isError?: boolean}
const ok = (data: unknown): ToolResult => ({
  content: [{type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2)}],
})
const fail = (msg: string): ToolResult => ({content: [{type: 'text', text: msg}], isError: true})
const guard = async (fn: () => Promise<ToolResult>): Promise<ToolResult> => {
  try {
    return await fn()
  } catch (e) {
    return fail(`error: ${String(e)}`)
  }
}

export default class Mcp extends Command {
  static description =
    'Run speccord as an MCP server over stdio — exposes read/verify/transition tools to Claude Code, Cursor, Copilot, and any MCP client.'
  static examples = ['<%= config.bin %> mcp']

  async run(): Promise<void> {
    const cwd = process.cwd()
    const server = new McpServer({name: 'speccord', version: '0.1.0'})

    // ---- read: give the agent ground truth ----
    server.registerTool(
      'speccord_capabilities',
      {description: 'The configured methodology: scale, active phases, enabled roles, and capability toggles.'},
      () => guard(async () => ok((await actionCapabilities(cwd)) ?? 'no speccord.config.yaml (run `speccord init`)')),
    )
    server.registerTool(
      'speccord_status',
      {description: 'List all specs (base + features) with their lifecycle status.'},
      () => guard(async () => ok(await actionStatus(cwd))),
    )
    server.registerTool(
      'speccord_get_base_spec',
      {description: 'Return the base spec — the technical contract the code is checked against.'},
      () =>
        guard(async () => {
          const cfg = await loadConfig(cwd)
          const txt = cfg ? await readFileSafe(cwd, cfg.baseSpec) : null
          return txt ? ok(txt) : fail('no base spec found')
        }),
    )
    server.registerTool(
      'speccord_get_constitution',
      {description: 'Return the project constitution — the non-negotiable principles (P-n).'},
      () =>
        guard(async () => {
          const cfg = await loadConfig(cwd)
          const txt = cfg ? await readFileSafe(cwd, cfg.constitution) : null
          return txt ? ok(txt) : fail('no constitution found')
        }),
    )
    server.registerTool(
      'speccord_get_file',
      {
        description: 'Read a spec/story/plan/tasks file by repo-relative path (e.g. specs/features/SPEC-1-foo.md).',
        inputSchema: {path: z.string().describe('repo-relative path under the specs directory')},
      },
      ({path}) =>
        guard(async () => {
          const txt = await readFileSafe(cwd, path)
          return txt !== null ? ok(txt) : fail(`not found: ${path}`)
        }),
    )
    server.registerTool(
      'speccord_stories',
      {description: 'List stories (id, status, epic, title, file) — the sprint board.'},
      () => guard(async () => ok(await actionStories(cwd))),
    )
    server.registerTool(
      'speccord_story_next',
      {description: 'The next story to work on (lowest-id story not yet Done), or null.'},
      () => guard(async () => ok((await actionStoryNext(cwd)) ?? 'no pending stories')),
    )

    // ---- verify: the deterministic gates the agent must satisfy ----
    server.registerTool(
      'speccord_analyze',
      {
        description: 'Deterministic cross-check of a feature spec vs its plan, tasks, and the constitution. Returns findings.',
        inputSchema: {specPath: z.string().describe('path to the feature spec')},
      },
      ({specPath}) => guard(async () => ok(await actionAnalyze(cwd, specPath))),
    )
    server.registerTool(
      'speccord_lint',
      {
        description: 'Lint feature spec(s): front-matter, base reference, AC↔test linkage.',
        inputSchema: {path: z.string().optional().describe('a single spec file; omit to lint all')},
      },
      ({path}) => guard(async () => ok(await actionLint(cwd, path))),
    )
    server.registerTool(
      'speccord_gate',
      {
        description: 'CI drift gate: did the contract surface change without a spec change in the same diff?',
        inputSchema: {base: z.string().optional().describe('git ref to diff against (default origin/main)')},
      },
      ({base}) => guard(async () => ok(await actionGate(cwd, base ?? 'origin/main'))),
    )
    server.registerTool(
      'speccord_conform',
      {
        description: 'Runtime drift: re-discover the live surface, diff the baseline, run contract checks.',
        inputSchema: {
          root: z.string().optional().describe('repo root to scan (default .)'),
          skipChecks: z.boolean().optional().describe('only structural drift; skip external checks'),
        },
      },
      ({root, skipChecks}) => guard(async () => ok(await actionConform(cwd, root ?? '.', {skipChecks}))),
    )
    server.registerTool(
      'speccord_discover',
      {
        description: 'Parse the codebase (OpenAPI, migrations, Kafka, security) into a discovery report.',
        inputSchema: {root: z.string().optional().describe('repo root to scan (default .)')},
      },
      ({root}) => guard(async () => ok(await actionDiscover(cwd, root ?? '.'))),
    )

    // ---- transition: move the lifecycle forward (gates enforced) ----
    server.registerTool(
      'speccord_advance',
      {
        description: 'Advance a spec to a new lifecycle status, enforcing the entry gate. Returns problems if blocked.',
        inputSchema: {specPath: z.string(), to: z.string().describe('target status, e.g. "Approved"')},
      },
      ({specPath, to}) => guard(async () => ok(await actionAdvance(cwd, specPath, to))),
    )
    server.registerTool(
      'speccord_story_advance',
      {
        description: 'Move a story through its status machine (Draft→Ready→In Progress→Review→Done).',
        inputSchema: {path: z.string(), to: z.string()},
      },
      ({path, to}) => guard(async () => ok(await actionStoryAdvance(cwd, path, to))),
    )
    server.registerTool(
      'speccord_update_baseline',
      {
        description: 'Snapshot the current discovered surface as the accepted conformance baseline.',
        inputSchema: {root: z.string().optional()},
      },
      ({root}) => guard(async () => ok(await actionUpdateBaseline(cwd, root ?? '.'))),
    )

    // ---- new tools: autonomy + the story dev loop ----
    server.registerTool(
      'speccord_next_action',
      {description: 'What to do next — the single most actionable workflow step given the current state.'},
      () => guard(async () => ok(await actionNextAction(cwd))),
    )
    server.registerTool(
      'speccord_story_tasks',
      {
        description: "Get a story's tasks, each with a self-contained dev prompt ready to implement.",
        inputSchema: {story: z.string().describe('story id (e.g. STORY-3) or repo-relative path')},
      },
      ({story}) => guard(async () => ok(await actionStoryTasks(cwd, story))),
    )
    server.registerTool(
      'speccord_mark_task',
      {
        description: 'Mark a story task done/undone. Moves the story to Review when all tasks are done.',
        inputSchema: {story: z.string(), taskId: z.string().describe('e.g. T-2'), done: z.boolean().optional()},
      },
      ({story, taskId, done}) => guard(async () => ok(await actionMarkTask(cwd, story, taskId, done ?? true))),
    )

    // ---- resources: canonical ground truth the agent can read/subscribe to ----
    server.registerResource(
      'base-spec',
      'speccord://base-spec',
      {title: 'Base spec', description: 'The technical contract the code is checked against', mimeType: 'text/markdown'},
      async (uri) => {
        const cfg = await loadConfig(cwd)
        const txt = cfg ? await readFileSafe(cwd, cfg.baseSpec) : null
        return {contents: [{uri: uri.href, text: txt ?? '(no base spec yet)'}]}
      },
    )
    server.registerResource(
      'constitution',
      'speccord://constitution',
      {title: 'Constitution', description: 'Non-negotiable project principles (P-n)', mimeType: 'text/markdown'},
      async (uri) => {
        const cfg = await loadConfig(cwd)
        const txt = cfg ? await readFileSafe(cwd, cfg.constitution) : null
        return {contents: [{uri: uri.href, text: txt ?? '(no constitution yet)'}]}
      },
    )
    server.registerResource(
      'capabilities',
      'speccord://capabilities',
      {title: 'Capabilities', description: 'Configured methodology: scale, phases, roles, capabilities', mimeType: 'application/json'},
      async (uri) => ({contents: [{uri: uri.href, text: JSON.stringify(await actionCapabilities(cwd), null, 2)}]}),
    )
    server.registerResource(
      'story',
      new ResourceTemplate('speccord://story/{id}', {
        list: async () => ({
          resources: (await actionStories(cwd)).map((r) => ({
            name: r.id,
            uri: `speccord://story/${r.id}`,
            description: `${r.status} — ${r.title}`,
          })),
        }),
      }),
      {title: 'Story', description: 'A context-engineered story by id'},
      async (uri, variables) => {
        const id = String(variables.id)
        const row = (await actionStories(cwd)).find((r) => r.id === id)
        const txt = row ? await readFileSafe(cwd, row.file.replace(/^\.\//, '')) : null
        return {contents: [{uri: uri.href, text: txt ?? `story ${id} not found`}]}
      },
    )

    // ---- prompts: slash-command-style flows ----
    server.registerPrompt(
      'implement-next-story',
      {title: 'Implement the next story', description: 'Fetch the next pending story and implement it against the spec'},
      async () => {
        const next = await actionStoryNext(cwd)
        if (!next) return {messages: [{role: 'user', content: {type: 'text', text: 'No pending stories.'}}]}
        const t = await actionStoryTasks(cwd, next.id)
        const pending = t.tasks.filter((x) => !x.done)
        const text =
          `Implement story ${t.id}: ${t.title}. Work the tasks in order; after each, run its tests and ` +
          `call speccord_mark_task. Stay inside the contract.\n\n` +
          pending.map((x) => `## ${x.id} — ${x.title}\n${x.prompt}`).join('\n\n')
        return {messages: [{role: 'user', content: {type: 'text', text}}]}
      },
    )
    server.registerPrompt(
      'review-changes',
      {title: 'Review changes against the spec', description: 'Run the gates and fix what they report'},
      async () => ({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                'Run speccord_lint, speccord_gate, speccord_conform, and speccord_analyze on the changed spec. ' +
                'For each failure, fix the code or the spec so they agree — never bypass a gate. Report what you changed.',
            },
          },
        ],
      }),
    )
    server.registerPrompt(
      'fix-drift',
      {title: 'Fix spec↔code drift', description: 'Check runtime conformance and reconcile any drift'},
      async () => {
        const r = await actionConform(cwd)
        const text = r.conformant
          ? 'speccord_conform reports CONFORMANT — no drift to fix.'
          : `speccord_conform reports drift:\n${JSON.stringify(r.drift, null, 2)}\n\nFor each item, either update the base spec to document the change, or revert the code. Re-run speccord_conform until clean.`
        return {messages: [{role: 'user', content: {type: 'text', text}}]}
      },
    )

    // stdio: stdout is the protocol channel — diagnostics go to stderr only.
    process.stderr.write('speccord MCP server: ready on stdio\n')
    await server.connect(new StdioServerTransport())
  }
}
