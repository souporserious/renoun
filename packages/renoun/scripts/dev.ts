import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { runPostBuildScripts } from './postbuild.ts'

export const TSC_WATCH_READY_MESSAGE = 'Watching for file changes.'
export const POST_BUILD_LOG_MESSAGE = '\n→ Running post-build scripts...'

interface HandleTypeScriptWatchOutputOptions {
  runPostBuildScripts?: () => Promise<void>
  writeOutput?: (output: string) => void
  log?: (message: string) => void
}

export function shouldRunPostBuildScripts(output: string): boolean {
  return output.includes(TSC_WATCH_READY_MESSAGE)
}

export async function handleTypeScriptWatchOutput(
  output: string,
  options: HandleTypeScriptWatchOutputOptions = {}
): Promise<boolean> {
  const writeOutput =
    options.writeOutput ?? ((text: string) => process.stdout.write(text))
  const log = options.log ?? console.log
  const runPatches = options.runPostBuildScripts ?? runPostBuildScripts

  writeOutput(output)

  if (!shouldRunPostBuildScripts(output)) {
    return false
  }

  log(POST_BUILD_LOG_MESSAGE)
  await runPatches()
  return true
}

export function createQueuedPostBuildRunner(
  runPatches: () => Promise<void> = runPostBuildScripts
): () => Promise<void> {
  let pending = Promise.resolve()

  return () => {
    const nextRun = pending.then(() => runPatches())
    pending = nextRun.catch(() => undefined)
    return nextRun
  }
}

export function startTypeScriptWatch() {
  const tsc = spawn('pnpm', ['tsc', '-w'], {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
  })
  const queuePostBuildRun = createQueuedPostBuildRunner()

  tsc.stdout.on('data', (data) => {
    const output = data.toString()

    void handleTypeScriptWatchOutput(output, {
      runPostBuildScripts: queuePostBuildRun,
    }).catch((error) => {
      console.error('Post-build error:', error)
    })
  })

  tsc.stderr.on('data', (data) => {
    process.stderr.write(data)
  })

  tsc.on('close', (code) => {
    process.exit(code ?? 0)
  })

  process.on('SIGINT', () => {
    tsc.kill()
    process.exit()
  })

  return tsc
}

function isDirectInvocation(): boolean {
  const invokedPath = process.argv[1]
  if (!invokedPath) {
    return false
  }

  return import.meta.url === pathToFileURL(invokedPath).href
}

if (isDirectInvocation()) {
  startTypeScriptWatch()
}
