import {join, dirname} from 'node:path'
import {readFile, writeFile} from 'node:fs/promises'
import {Command, Flags} from '@oclif/core'
import {ensureDir} from '../lib/config.js'
import {filesForTool} from '../lib/agentrules.js'

const TOOLS = ['claude', 'cursor', 'copilot'] as const
type Tool = (typeof TOOLS)[number]

export default class AgentRules extends Command {
  static description =
    'Generate agent integration files (MCP server config + spec-as-contract rules) for Claude Code, Cursor, and Copilot.'
  static examples = [
    '<%= config.bin %> agent-rules',
    '<%= config.bin %> agent-rules --tool cursor',
    '<%= config.bin %> agent-rules --command "node ./bin/run.js" --force',
  ]
  static flags = {
    tool: Flags.string({description: 'which tool(s) to wire up', options: [...TOOLS, 'all'], default: 'all'}),
    command: Flags.string({
      description: 'the command agents launch for the MCP server (appended with "mcp")',
      default: 'speccord',
    }),
    force: Flags.boolean({description: 'overwrite existing files'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AgentRules)
    const cwd = process.cwd()
    const tools: Tool[] = flags.tool === 'all' ? [...TOOLS] : [flags.tool as Tool]

    for (const tool of tools) {
      this.log(`\n${tool}:`)
      for (const f of filesForTool(tool, flags.command)) {
        const abs = join(cwd, f.path)
        let exists = false
        try {
          await readFile(abs, 'utf8')
          exists = true
        } catch {
          /* absent */
        }
        if (exists && !flags.force) {
          this.log(`  • ${f.path} (exists — skipped; --force to overwrite)`)
          continue
        }
        await ensureDir(dirname(abs))
        await writeFile(abs, f.content)
        this.log(`  ✓ ${f.path}`)
      }
    }

    this.log(
      `\nMCP server command: \`${flags.command} mcp\`. ` +
        'Restart your agent so it picks up the new MCP config. ' +
        'Verify with: speccord mcp  (it should print "ready on stdio").',
    )
    if (flags.command === 'speccord')
      this.log('Note: agents launch `speccord` from PATH — run `npm link` (or install globally) so it resolves.')
  }
}
