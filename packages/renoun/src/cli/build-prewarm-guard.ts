import { spawn } from 'node:child_process'

import { resolveFrameworkBinFile, type Framework } from './framework.ts'
import {
  getMissingNextGeneratedTypesConfigWarning as getMissingNextGeneratedTypesConfigWarningShared,
  getNextGeneratedTypesStatus as getNextGeneratedTypesStatusShared,
  type NextGeneratedTypesStatus as SharedNextGeneratedTypesStatus,
} from '../utils/next-generated-types.ts'

export interface NextGeneratedTypesStatus
  extends SharedNextGeneratedTypesStatus {
  framework: Framework
}

export function getNextGeneratedTypesStatus(options: {
  framework: Framework
  rootPath: string
  tsConfigFilePath?: string
}): NextGeneratedTypesStatus {
  if (options.framework !== 'next') {
    return {
      framework: options.framework,
      tsConfigFilePath: options.tsConfigFilePath,
      isTypeScriptProject: false,
      isLikelyNextProject: false,
      hasNextEnvFile: false,
      hasNextEnvTypeConfig: false,
      hasGeneratedRouteTypeConfig: false,
      hasRequiredTypeConfig: false,
      hasGeneratedRouteTypes: false,
      missingGeneratedRouteTypes: false,
    }
  }

  return {
    framework: options.framework,
    ...getNextGeneratedTypesStatusShared({
      rootPath: options.rootPath,
      tsConfigFilePath: options.tsConfigFilePath,
    }),
  }
}

export function getMissingNextGeneratedTypesConfigWarning(
  status: NextGeneratedTypesStatus
): string | undefined {
  if (
    status.framework !== 'next' ||
    !status.isTypeScriptProject ||
    status.hasRequiredTypeConfig
  ) {
    return undefined
  }

  return (
    getMissingNextGeneratedTypesConfigWarningShared(status) ??
    'Next.js route-aware types are not fully configured in tsconfig include. ' +
      'Add "next-env.d.ts" and ".next/types/**/*.ts" if you use PageProps, LayoutProps, or RouteContext.'
  )
}

export function shouldSkipBuildPrewarmForMissingNextGeneratedTypes(options: {
  framework: Framework
  rootPath: string
  tsConfigFilePath?: string
}): boolean {
  return getNextGeneratedTypesStatus(options).missingGeneratedRouteTypes
}

async function waitForProcessExit(
  child: ReturnType<typeof spawn>,
  commandLabel: string
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise)
    child.once('close', (code, signal) => {
      if ((code ?? 0) === 0) {
        resolvePromise()
        return
      }

      const formattedSignal = signal ? ` (signal: ${signal})` : ''
      rejectPromise(
        new Error(
          `[renoun] ${commandLabel} exited with code ${code ?? 1}${formattedSignal}.`
        )
      )
    })
  })
}

export async function ensureNextGeneratedTypes(options: {
  framework: Framework
  rootPath: string
  tsConfigFilePath?: string
  log: (message: string) => void
}): Promise<NextGeneratedTypesStatus> {
  const initialStatus = getNextGeneratedTypesStatus(options)

  if (
    initialStatus.framework !== 'next' ||
    !initialStatus.isTypeScriptProject ||
    !initialStatus.missingGeneratedRouteTypes
  ) {
    return initialStatus
  }

  const frameworkBinPath = resolveFrameworkBinFile('next', {
    fromDirectory: options.rootPath,
  })

  options.log('Generating Next.js route-aware types...')

  const child = spawn(process.execPath, [frameworkBinPath, 'typegen'], {
    stdio: 'inherit',
    shell: false,
    cwd: options.rootPath,
    env: process.env,
  })

  await waitForProcessExit(child, 'next typegen')

  options.log('Next.js route-aware types generated')

  return getNextGeneratedTypesStatus(options)
}
