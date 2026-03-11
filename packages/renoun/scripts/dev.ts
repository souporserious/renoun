import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { patchLoadPackage } from './patch-load-package.ts'

export const TSC_WATCH_READY_MESSAGE = 'Watching for file changes.'
export const PATCH_LOAD_PACKAGE_LOG_MESSAGE =
  '\n→ Running load-package patch...'

interface HandleTypeScriptWatchOutputOptions {
  patchLoadPackage?: () => Promise<void>
  writeOutput?: (output: string) => void
  log?: (message: string) => void
}

export function shouldPatchLoadPackage(output: string): boolean {
  return output.includes(TSC_WATCH_READY_MESSAGE)
}

export async function handleTypeScriptWatchOutput(
  output: string,
  options: HandleTypeScriptWatchOutputOptions = {}
): Promise<boolean> {
  const writeOutput =
    options.writeOutput ?? ((text: string) => process.stdout.write(text))
  const log = options.log ?? console.log
  const runPatch = options.patchLoadPackage ?? patchLoadPackage

  writeOutput(output)

  if (!shouldPatchLoadPackage(output)) {
    return false
  }

  log(PATCH_LOAD_PACKAGE_LOG_MESSAGE)
  await runPatch()
  return true
}

export function createQueuedPatchLoadPackageRunner(
  runPatch: () => Promise<void> = patchLoadPackage
): () => Promise<void> {
  let pending = Promise.resolve()

  return () => {
    const nextRun = pending.then(() => runPatch())
    pending = nextRun.catch(() => undefined)
    return nextRun
  }
}

export function startTypeScriptWatch() {
  const tsc = spawn('pnpm', ['tsc', '-w'], {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
  })
  const queuePatchLoadPackageRun = createQueuedPatchLoadPackageRunner()

  tsc.stdout.on('data', (data) => {
    const output = data.toString()

    void handleTypeScriptWatchOutput(output, {
      patchLoadPackage: queuePatchLoadPackageRun,
    }).catch((error) => {
      console.error('Patch error:', error)
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
