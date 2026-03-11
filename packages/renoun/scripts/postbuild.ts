import { pathToFileURL } from 'node:url'

import { patchLoadPackage } from './patch-load-package.ts'

interface RunPostBuildScriptsOptions {
  runStep?: (step: () => Promise<void>) => Promise<void>
  steps?: ReadonlyArray<() => Promise<void>>
}

export const POST_BUILD_STEPS = [patchLoadPackage] as const

export async function runPostBuildScripts(
  options: RunPostBuildScriptsOptions = {}
): Promise<void> {
  const runStep =
    options.runStep ?? (async (step: () => Promise<void>) => step())
  const steps = options.steps ?? POST_BUILD_STEPS

  for (const step of steps) {
    await runStep(step)
  }
}

function isDirectInvocation(): boolean {
  const invokedPath = process.argv[1]
  if (!invokedPath) {
    return false
  }

  return import.meta.url === pathToFileURL(invokedPath).href
}

if (isDirectInvocation()) {
  runPostBuildScripts().catch((error) => {
    console.error(error.stack ?? String(error))
    process.exitCode = 1
  })
}
