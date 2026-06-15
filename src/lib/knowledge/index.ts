import {readFile, stat} from 'node:fs/promises'
import {join, extname, resolve, basename} from 'node:path'
import {pathToFileURL} from 'node:url'
import fg from 'fast-glob'
import type {KnowledgeConfig} from '../config.js'

// Knowledge onboarding: pull existing organizational knowledge (PDF, Word,
// Confluence, Jira, URLs, markdown) into speccord so a persona can DRAFT a spec
// from it. Sources are untrusted input — the draft is always reviewed by a human
// before it becomes authoritative (the hybrid invariant holds).
//
// Importers are a strategy registry, exactly like discovery providers: built-ins
// here, plus enterprise plugins for "any other supported strategy".

export interface KnowledgeSource {
  importer: string
  title: string
  uri: string
  text: string
}

export interface ImportContext {
  cwd: string
  cfg?: KnowledgeConfig
}

export interface Importer {
  name: string
  description: string
  // Does this importer handle the given ref? (scheme prefix, URL, or extension)
  matches(ref: string): boolean
  load(ref: string, ctx: ImportContext): Promise<KnowledgeSource[]>
}

// ---- helpers ----

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function tryDep(mod: string): Promise<any | null> {
  try {
    return await import(mod)
  } catch {
    return null
  }
}

// Walk Atlassian Document Format (Jira v3 description) collecting text.
function adfText(node: any): string {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  if (Array.isArray(node.content)) return node.content.map(adfText).join(node.type === 'paragraph' ? '' : '\n')
  return ''
}

// ---- built-in importers ----

const textImporter: Importer = {
  name: 'text',
  description: 'Markdown / plain-text files (.md, .markdown, .txt)',
  matches: (r) => /\.(md|markdown|txt)$/i.test(r),
  load: async (ref, {cwd}) => {
    const text = await readFile(resolve(cwd, ref), 'utf8')
    return [{importer: 'text', title: basename(ref), uri: ref, text}]
  },
}

const htmlImporter: Importer = {
  name: 'html',
  description: 'Local HTML files (.html, .htm)',
  matches: (r) => /\.html?$/i.test(r),
  load: async (ref, {cwd}) => {
    const raw = await readFile(resolve(cwd, ref), 'utf8')
    return [{importer: 'html', title: basename(ref), uri: ref, text: stripHtml(raw)}]
  },
}

const urlImporter: Importer = {
  name: 'url',
  description: 'Any web page (https://…)',
  matches: (r) => /^https?:\/\//i.test(r),
  load: async (ref) => {
    const res = await fetch(ref)
    if (!res.ok) throw new Error(`fetch ${ref} → HTTP ${res.status}`)
    const body = await res.text()
    return [{importer: 'url', title: ref, uri: ref, text: stripHtml(body)}]
  },
}

const pdfImporter: Importer = {
  name: 'pdf',
  description: 'PDF documents (requires: npm i pdf-parse)',
  matches: (r) => /\.pdf$/i.test(r),
  load: async (ref, {cwd}) => {
    const dep = await tryDep('pdf-parse')
    if (!dep) throw new Error('PDF support needs the optional dependency: npm i pdf-parse')
    const buf = await readFile(resolve(cwd, ref))
    const data = await (dep.default ?? dep)(buf)
    return [{importer: 'pdf', title: basename(ref), uri: ref, text: data.text}]
  },
}

const docxImporter: Importer = {
  name: 'docx',
  description: 'Word documents (requires: npm i mammoth)',
  matches: (r) => /\.docx$/i.test(r),
  load: async (ref, {cwd}) => {
    const dep = await tryDep('mammoth')
    if (!dep) throw new Error('Word support needs the optional dependency: npm i mammoth')
    const buf = await readFile(resolve(cwd, ref))
    const res = await (dep.extractRawText ?? dep.default.extractRawText)({buffer: buf})
    return [{importer: 'docx', title: basename(ref), uri: ref, text: res.value}]
  },
}

const confluenceImporter: Importer = {
  name: 'confluence',
  description: 'Confluence page by id — confluence:<pageId> (env CONFLUENCE_BASE_URL, CONFLUENCE_TOKEN[, CONFLUENCE_EMAIL])',
  matches: (r) => r.startsWith('confluence:'),
  load: async (ref, {cfg}) => {
    const id = ref.slice('confluence:'.length)
    const base = process.env.CONFLUENCE_BASE_URL || cfg?.confluence?.baseUrl
    const token = process.env.CONFLUENCE_TOKEN
    if (!base || !token) throw new Error('set CONFLUENCE_BASE_URL and CONFLUENCE_TOKEN (and knowledge.confluence.baseUrl)')
    const auth = process.env.CONFLUENCE_EMAIL
      ? 'Basic ' + Buffer.from(`${process.env.CONFLUENCE_EMAIL}:${token}`).toString('base64')
      : `Bearer ${token}`
    const url = `${base.replace(/\/$/, '')}/wiki/rest/api/content/${id}?expand=body.storage`
    const res = await fetch(url, {headers: {Authorization: auth, Accept: 'application/json'}})
    if (!res.ok) throw new Error(`Confluence ${id} → HTTP ${res.status}`)
    const doc: any = await res.json()
    return [{importer: 'confluence', title: doc.title ?? id, uri: url, text: stripHtml(doc?.body?.storage?.value ?? '')}]
  },
}

const jiraImporter: Importer = {
  name: 'jira',
  description: 'Jira issues — jira:<KEY> or jira:"<JQL>" (env JIRA_BASE_URL, JIRA_EMAIL, JIRA_TOKEN)',
  matches: (r) => r.startsWith('jira:'),
  load: async (ref, {cfg}) => {
    const q = ref.slice('jira:'.length)
    const jql = /^[A-Z][A-Z0-9]+-\d+$/.test(q) ? `key = ${q}` : q.replace(/^"|"$/g, '')
    const base = process.env.JIRA_BASE_URL || cfg?.jira?.baseUrl
    const email = process.env.JIRA_EMAIL
    const token = process.env.JIRA_TOKEN
    if (!base || !email || !token) throw new Error('set JIRA_BASE_URL, JIRA_EMAIL and JIRA_TOKEN')
    const auth = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64')
    const url = `${base.replace(/\/$/, '')}/rest/api/3/search?maxResults=25&fields=summary,description,status&jql=${encodeURIComponent(jql)}`
    const res = await fetch(url, {headers: {Authorization: auth, Accept: 'application/json'}})
    if (!res.ok) throw new Error(`Jira "${jql}" → HTTP ${res.status}`)
    const data: any = await res.json()
    return (data.issues ?? []).map((it: any) => ({
      importer: 'jira',
      title: `${it.key}: ${it.fields?.summary ?? ''}`,
      uri: `${base.replace(/\/$/, '')}/browse/${it.key}`,
      text: `${it.key} — ${it.fields?.summary ?? ''}\nStatus: ${it.fields?.status?.name ?? '?'}\n\n${adfText(it.fields?.description)}`,
    }))
  },
}

export const BUILTIN_IMPORTERS: Importer[] = [
  textImporter,
  htmlImporter,
  urlImporter,
  pdfImporter,
  docxImporter,
  confluenceImporter,
  jiraImporter,
]

export function importerFor(ref: string, extra: Importer[] = []): Importer | undefined {
  return [...BUILTIN_IMPORTERS, ...extra].find((i) => i.matches(ref))
}

async function loadPluginImporters(cwd: string, paths: string[]): Promise<Importer[]> {
  const out: Importer[] = []
  for (const p of paths) {
    try {
      const mod: any = await import(pathToFileURL(resolve(cwd, p)).href)
      const list = mod.default ?? mod.importers
      if (Array.isArray(list)) out.push(...list)
    } catch {
      /* ignore bad plugin */
    }
  }
  return out
}

export interface GatherResult {
  sources: KnowledgeSource[]
  warnings: string[]
}

// Resolve every ref (file, glob, dir, url, or scheme) and load its sources.
export async function gather(refs: string[], ctx: ImportContext): Promise<GatherResult> {
  const plugins = ctx.cfg?.plugins?.length ? await loadPluginImporters(ctx.cwd, ctx.cfg.plugins) : []
  const sources: KnowledgeSource[] = []
  const warnings: string[] = []

  // Expand local file globs / directories into concrete file refs.
  const expanded: string[] = []
  for (const ref of refs) {
    if (/^[a-z]+:/i.test(ref) && !/\.[a-z0-9]+$/i.test(ref) && !ref.startsWith('http')) {
      expanded.push(ref) // scheme like jira:/confluence:
    } else if (/^https?:\/\//i.test(ref)) {
      expanded.push(ref)
    } else {
      let isDir = false
      try {
        isDir = (await stat(join(ctx.cwd, ref))).isDirectory()
      } catch {
        /* not a path; maybe a glob */
      }
      const pattern = isDir ? `${ref}/**/*.{md,markdown,txt,html,htm,pdf,docx}` : ref
      const hits = await fg([pattern], {cwd: ctx.cwd, suppressErrors: true})
      if (hits.length) expanded.push(...hits)
      else expanded.push(ref)
    }
  }

  for (const ref of expanded) {
    const imp = importerFor(ref, plugins)
    if (!imp) {
      warnings.push(`no importer for "${ref}"`)
      continue
    }
    try {
      sources.push(...(await imp.load(ref, ctx)))
    } catch (e) {
      warnings.push(`${ref}: ${String((e as Error).message ?? e)}`)
    }
  }
  return {sources, warnings}
}

export function listStrategies(): {name: string; description: string}[] {
  return BUILTIN_IMPORTERS.map((i) => ({name: i.name, description: i.description}))
}
