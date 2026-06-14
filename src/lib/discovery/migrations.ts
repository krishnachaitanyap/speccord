import {readFile} from 'node:fs/promises'
import fg from 'fast-glob'
import type {ColumnInfo, TableInfo} from '../spec/model.js'

export interface MigrationsResult {
  tables: TableInfo[]
  files: string[]
  warning?: string
}

// Heuristic CREATE TABLE parser. Good enough for discovery; the developer
// confirms/corrects in the review step.
function parseCreateTables(sql: string, sourceFile: string): TableInfo[] {
  const tables: TableInfo[] = []
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([\w.]+)["`]?\s*\(([\s\S]*?)\)\s*;/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql))) {
    const name = m[1].replace(/^.*\./, '')
    const inner = m[2]
    const columns: ColumnInfo[] = []
    const primaryKey: string[] = []

    // Split on top-level commas (ignore commas inside parentheses).
    const parts: string[] = []
    let depth = 0
    let buf = ''
    for (const ch of inner) {
      if (ch === '(') depth++
      if (ch === ')') depth--
      if (ch === ',' && depth === 0) {
        parts.push(buf)
        buf = ''
      } else buf += ch
    }
    if (buf.trim()) parts.push(buf)

    for (const part of parts) {
      const line = part.trim()
      const pk = line.match(/primary\s+key\s*\(([^)]+)\)/i)
      if (pk) {
        primaryKey.push(...pk[1].split(',').map((s) => s.trim().replace(/["`]/g, '')))
        continue
      }
      if (/^(constraint|foreign\s+key|unique|check|index)/i.test(line)) continue
      const col = line.match(/^["`]?(\w+)["`]?\s+([\w()]+)/)
      if (!col) continue
      const inlinePk = /primary\s+key/i.test(line)
      if (inlinePk) primaryKey.push(col[1])
      columns.push({
        name: col[1],
        type: col[2].toLowerCase(),
        nullable: !/not\s+null/i.test(line) && !inlinePk,
      })
    }
    tables.push({name, columns, primaryKey, sourceFile})
  }
  return tables
}

export async function discoverMigrations(root: string): Promise<MigrationsResult> {
  const files = await fg(
    ['**/db/migration/**/*.sql', '**/resources/**/V*__*.sql', '**/migrations/**/*.sql'],
    {
      cwd: root,
      absolute: true,
      ignore: ['**/node_modules/**', '**/target/**', '**/build/**'],
      suppressErrors: true,
    },
  )
  if (files.length === 0) return {tables: [], files: [], warning: 'no SQL migration files found'}

  const byTable = new Map<string, TableInfo>()
  for (const f of files.sort()) {
    try {
      const sql = await readFile(f, 'utf8')
      for (const t of parseCreateTables(sql, f.replace(root, '.'))) byTable.set(t.name, t)
    } catch {
      /* ignore unreadable file */
    }
  }
  return {tables: [...byTable.values()], files: files.map((f) => f.replace(root, '.'))}
}
