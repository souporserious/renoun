import { spawn } from 'node:child_process'

const DEFAULT_MAX_BUFFER = 100 * 1024 * 1024
const DEFAULT_TIMEOUT_EXIT_STATUS = 124

export interface SpawnResult {
  status: number | null
  stdout: string
  stderr: string
}

export interface SpawnWithResultOptions {
  cwd: string
  maxBuffer?: number
  verbose?: boolean
  env?: NodeJS.ProcessEnv
  shell?: boolean
  timeoutMs?: number
}

/** Spawns a process and returns status code + output. */
export function spawnWithResult(
  command: string,
  commandArguments: string[],
  options: SpawnWithResultOptions
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArguments, {
      cwd: options.cwd,
      stdio: 'pipe',
      env: options.env ?? process.env,
      shell: options.shell ?? false,
    })

    let stdout = ''
    let stderr = ''
    const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER
    let totalBytes = 0
    let settled = false
    const timeoutMs = options.timeoutMs ?? 0
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const finish = (error?: Error, result?: SpawnResult) => {
      if (settled) {
        return
      }
      settled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      if (error) {
        reject(error)
        return
      }
      resolve(result!)
    }

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // Ignore kill failures while handling timeout.
        }

        const timeoutMessage = `Command timed out after ${timeoutMs}ms`
        stderr = stderr ? `${stderr}\n${timeoutMessage}` : timeoutMessage
        finish(undefined, {
          status: DEFAULT_TIMEOUT_EXIT_STATUS,
          stdout,
          stderr,
        })
      }, timeoutMs)
    }

    const onData = (chunk: Buffer, isStdout: boolean) => {
      totalBytes += chunk.length
      if (totalBytes > maxBuffer) {
        child.kill()
        finish(
          new Error(
            `maxBuffer exceeded (${maxBuffer} bytes) for: ${command} ${commandArguments.join(
              ' '
            )}`
          )
        )
        return
      }

      const text = chunk.toString()
      if (isStdout) {
        stdout += text
        if (options.verbose) {
          process.stdout.write(text)
        }
      } else {
        stderr += text
        if (options.verbose) {
          process.stderr.write(text)
        }
      }
    }

    child.stdout?.on('data', (chunk) => onData(chunk, true))
    child.stderr?.on('data', (chunk) => onData(chunk, false))

    child.on('error', (error) => finish(error))
    child.on('close', (status) => finish(undefined, { status, stdout, stderr }))
  })
}
