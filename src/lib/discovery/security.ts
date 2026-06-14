import {readFile} from 'node:fs/promises'
import fg from 'fast-glob'

export interface SecurityResult {
  resourceServer: boolean
  jwksConfigured: boolean
  scopes: string[]
  annotations: string[]
}

export async function discoverSecurity(root: string): Promise<SecurityResult> {
  const scopes = new Set<string>()
  const annotations = new Set<string>()
  let resourceServer = false
  let jwksConfigured = false

  const configs = await fg(['**/application*.{yml,yaml}', '**/application*.properties'], {
    cwd: root,
    absolute: true,
    ignore: ['**/node_modules/**', '**/target/**', '**/build/**'],
    suppressErrors: true,
  })
  for (const f of configs) {
    try {
      const raw = await readFile(f, 'utf8')
      if (/resourceserver|resource-server/i.test(raw)) resourceServer = true
      if (/jwk-set-uri|jwkSetUri|jwks/i.test(raw)) {
        jwksConfigured = true
        resourceServer = true
      }
    } catch {
      /* ignore */
    }
  }

  const sources = await fg(['**/*.java', '**/*.kt'], {
    cwd: root,
    absolute: true,
    ignore: ['**/node_modules/**', '**/target/**', '**/build/**', '**/test/**'],
    suppressErrors: true,
  })
  for (const f of sources) {
    try {
      const raw = await readFile(f, 'utf8')
      if (/oauth2ResourceServer|EnableResourceServer/i.test(raw)) resourceServer = true
      for (const m of raw.matchAll(/@PreAuthorize\s*\(\s*"([^"]+)"/g)) {
        annotations.add(m[1])
        for (const s of m[1].matchAll(/SCOPE_([\w:.-]+)|hasAuthority\(\s*'([^']+)'/g)) {
          const scope = (s[1] ?? s[2] ?? '').replace(/^SCOPE_/, '')
          if (scope) scopes.add(scope)
        }
      }
      for (const m of raw.matchAll(/["']SCOPE_([\w:.-]+)["']/g)) scopes.add(m[1])
    } catch {
      /* ignore */
    }
  }

  return {
    resourceServer,
    jwksConfigured,
    scopes: [...scopes].sort(),
    annotations: [...annotations].slice(0, 50),
  }
}
