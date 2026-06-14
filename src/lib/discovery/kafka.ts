import {readFile} from 'node:fs/promises'
import fg from 'fast-glob'
import {parse} from 'yaml'
import type {TopicInfo} from '../spec/model.js'

export interface KafkaResult {
  topics: TopicInfo[]
  warning?: string
}

function flatten(obj: any, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k
      if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key))
      else out[key] = v
    }
  }
  return out
}

export async function discoverKafka(root: string): Promise<KafkaResult> {
  const topics = new Map<string, TopicInfo>()
  const add = (name: string, role: TopicInfo['role'], source: string) => {
    if (name && !topics.has(`${name}:${role}`)) topics.set(`${name}:${role}`, {name, role, source})
  }

  // 1) Spring config files: look for keys mentioning topic.
  const configs = await fg(['**/application*.{yml,yaml}', '**/application*.properties'], {
    cwd: root,
    absolute: true,
    ignore: ['**/node_modules/**', '**/target/**', '**/build/**'],
    suppressErrors: true,
  })
  for (const f of configs) {
    try {
      const raw = await readFile(f, 'utf8')
      const rel = f.replace(root, '.')
      if (f.endsWith('.properties')) {
        for (const line of raw.split('\n')) {
          const m = line.match(/^\s*([\w.-]*topic[\w.-]*)\s*=\s*(.+)$/i)
          if (m) add(m[2].trim(), 'configured', rel)
        }
      } else {
        const flat = flatten(parse(raw) ?? {})
        for (const [k, v] of Object.entries(flat)) {
          if (/topic/i.test(k) && typeof v === 'string') add(v, 'configured', rel)
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 2) Source annotations: @KafkaListener(topics=...) and KafkaTemplate.send("topic", ...)
  const sources = await fg(['**/*.java', '**/*.kt'], {
    cwd: root,
    absolute: true,
    ignore: ['**/node_modules/**', '**/target/**', '**/build/**', '**/test/**'],
    suppressErrors: true,
  })
  for (const f of sources) {
    try {
      const raw = await readFile(f, 'utf8')
      const rel = f.replace(root, '.')
      for (const m of raw.matchAll(/@KafkaListener\s*\([^)]*topics\s*=\s*\{?\s*"([^"]+)"/g))
        add(m[1], 'consumes', rel)
      for (const m of raw.matchAll(/\.send\s*\(\s*"([^"]+)"/g)) add(m[1], 'produces', rel)
    } catch {
      /* ignore */
    }
  }

  const list = [...topics.values()]
  return {topics: list, warning: list.length === 0 ? 'no Kafka topics discovered' : undefined}
}
