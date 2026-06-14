import {spawn} from 'node:child_process'

export interface RunResult {
  code: number
  output: string
}

// Run a shell command, optionally feeding `stdin`. Captures combined output
// (tail-truncated). Used to drive coding agents and test commands.
export function sh(cmd: string, cwd: string, stdin?: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', cmd], {cwd})
    let output = ''
    child.stdout.on('data', (d) => (output += d.toString()))
    child.stderr.on('data', (d) => (output += d.toString()))
    child.on('close', (code) => resolve({code: code ?? 1, output: output.slice(-4000)}))
    if (stdin !== undefined) {
      child.stdin.write(stdin)
      child.stdin.end()
    }
  })
}
