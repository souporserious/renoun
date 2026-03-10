import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const POST_BUILD_SCRIPT_PATHS = [
  './scripts/patch-load-package.ts',
  './scripts/patch-analysis-client-imports.ts',
] as const

interface RunPostBuildScriptsOptions {
  runScript?: (scriptPath: string) => Promise<void>
}

export function runNodeScript(scriptPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(
        new Error(
          `[postbuild] ${scriptPath} exited with code ${code ?? 'unknown'}`
        )
      )
    })
  })
}

export async function runPostBuildScripts(
  options: RunPostBuildScriptsOptions = {}
): Promise<void> {
  const runScript = options.runScript ?? runNodeScript

  for (const scriptPath of POST_BUILD_SCRIPT_PATHS) {
    await runScript(scriptPath)
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
