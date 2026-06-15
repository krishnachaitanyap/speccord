import fg from 'fast-glob'
import type {Stack} from './provider.js'

// Marker file -> language. Used to auto-select providers and to derive sensible
// contract-surface defaults per stack (so the CI gate isn't hardwired to one stack).
const MARKERS: {pattern: string; language: string}[] = [
  {pattern: 'pom.xml', language: 'java'},
  {pattern: 'build.gradle', language: 'java'},
  {pattern: 'build.gradle.kts', language: 'java'},
  {pattern: 'package.json', language: 'node'},
  {pattern: 'go.mod', language: 'go'},
  {pattern: 'pyproject.toml', language: 'python'},
  {pattern: 'requirements.txt', language: 'python'},
  {pattern: 'setup.py', language: 'python'},
  {pattern: 'Gemfile', language: 'ruby'},
  {pattern: 'Cargo.toml', language: 'rust'},
  {pattern: 'composer.json', language: 'php'},
]

export async function detectStack(root: string): Promise<Stack> {
  const found = await fg(
    MARKERS.map((m) => `**/${m.pattern}`),
    {cwd: root, ignore: ['**/node_modules/**', '**/target/**', '**/build/**', '**/dist/**', '**/vendor/**'], suppressErrors: true},
  )
  const base = found.map((f) => f.split('/').pop() ?? f)
  const languages = new Set<string>()
  const markers = new Set<string>()
  for (const m of MARKERS)
    if (base.includes(m.pattern)) {
      languages.add(m.language)
      markers.add(m.pattern)
    }
  return {languages: [...languages].sort(), markers: [...markers].sort()}
}
