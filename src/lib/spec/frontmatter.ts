import {readFile, writeFile} from 'node:fs/promises'
import {parse, stringify} from 'yaml'
import type {FrontMatter} from './model.js'

const FM_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/

export interface ParsedSpec {
  frontMatter: FrontMatter
  body: string
}

export function parseSpec(raw: string): ParsedSpec {
  const m = raw.match(FM_RE)
  if (!m) return {frontMatter: {}, body: raw}
  const frontMatter = (parse(m[1]) ?? {}) as FrontMatter
  return {frontMatter, body: m[2] ?? ''}
}

export function serializeSpec(spec: ParsedSpec): string {
  const fm = stringify(spec.frontMatter).trimEnd()
  return `---\n${fm}\n---\n\n${spec.body.replace(/^\n+/, '')}`
}

export async function readSpec(path: string): Promise<ParsedSpec> {
  return parseSpec(await readFile(path, 'utf8'))
}

export async function writeSpec(path: string, spec: ParsedSpec): Promise<void> {
  await writeFile(path, serializeSpec(spec), 'utf8')
}
