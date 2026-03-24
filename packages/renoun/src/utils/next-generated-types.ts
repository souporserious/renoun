import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { getDiagnosticMessageText } from './get-diagnostic-message.ts'
import { normalizeSlashes } from './path.ts'
import { getTsMorph } from './ts-morph.ts'
import type { Diagnostic, SourceFile, ts } from './ts-morph.ts'

const NEXT_ENV_D_TS_RE = /(^|\/)next-env\.d\.ts$/i
const NEXT_GENERATED_TYPES_INCLUDE_RE =
  /(^|\/)\.next\/(?:dev\/)?types(?:\/|$)/i
const NEXT_ROUTE_TYPES_PATH_RE =
  /(^|\/)\.next\/(?:dev\/)?types\/routes\.d\.ts$/i
const NEXT_ROUTE_AWARE_HELPER_DIAGNOSTIC_RE =
  /Cannot find name '(PageProps|LayoutProps|RouteContext)'/

export interface NextGeneratedTypesStatus {
  tsConfigFilePath?: string
  isTypeScriptProject: boolean
  isLikelyNextProject: boolean
  hasNextEnvFile: boolean
  hasNextEnvTypeConfig: boolean
  hasGeneratedRouteTypeConfig: boolean
  hasRequiredTypeConfig: boolean
  hasGeneratedRouteTypes: boolean
  missingGeneratedRouteTypes: boolean
}

function resolveTsConfigFilePath(options: {
  rootPath: string
  tsConfigFilePath?: string
}): string | undefined {
  const tsConfigFilePath = resolve(
    options.tsConfigFilePath ?? resolve(options.rootPath, 'tsconfig.json')
  )

  if (!existsSync(tsConfigFilePath)) {
    return undefined
  }

  return tsConfigFilePath
}

function formatValueList(values: string[]): string {
  if (values.length <= 1) {
    return values[0] ?? ''
  }

  if (values.length === 2) {
    return `${values[0]} or ${values[1]}`
  }

  return `${values.slice(0, -1).join(', ')}, or ${values.at(-1)}`
}

export function getNextGeneratedTypesStatus(options: {
  rootPath: string
  tsConfigFilePath?: string
}): NextGeneratedTypesStatus {
  const tsConfigFilePath = resolveTsConfigFilePath(options)
  const nextEnvFilePath = resolve(options.rootPath, 'next-env.d.ts')
  const hasNextEnvFile = existsSync(nextEnvFilePath)

  if (!tsConfigFilePath) {
    return {
      tsConfigFilePath,
      isTypeScriptProject: false,
      isLikelyNextProject: hasNextEnvFile,
      hasNextEnvFile,
      hasNextEnvTypeConfig: false,
      hasGeneratedRouteTypeConfig: false,
      hasRequiredTypeConfig: false,
      hasGeneratedRouteTypes: false,
      missingGeneratedRouteTypes: false,
    }
  }

  try {
    const { ts: typescript } = getTsMorph()
    const sourceFile = typescript.readJsonConfigFile(
      tsConfigFilePath,
      typescript.sys.readFile
    )
    const parsed = typescript.parseJsonSourceFileConfigFileContent(
      sourceFile,
      typescript.sys,
      dirname(tsConfigFilePath),
      undefined,
      tsConfigFilePath
    )
    const includePatterns = Array.isArray(parsed.raw?.include)
      ? parsed.raw.include.filter(
          (value: unknown): value is string => typeof value === 'string'
        )
      : []

    const hasNextEnvTypeConfig = includePatterns.some((pattern: string) =>
      NEXT_ENV_D_TS_RE.test(normalizeSlashes(pattern))
    )
    const hasGeneratedRouteTypeConfig = includePatterns.some(
      (pattern: string) =>
        NEXT_GENERATED_TYPES_INCLUDE_RE.test(normalizeSlashes(pattern))
    )
    const hasRequiredTypeConfig =
      hasNextEnvTypeConfig && hasGeneratedRouteTypeConfig
    const hasGeneratedRouteTypes = parsed.fileNames.some((filePath) =>
      NEXT_ROUTE_TYPES_PATH_RE.test(normalizeSlashes(filePath))
    )
    const isLikelyNextProject =
      hasNextEnvFile ||
      hasNextEnvTypeConfig ||
      hasGeneratedRouteTypeConfig ||
      hasGeneratedRouteTypes

    return {
      tsConfigFilePath,
      isTypeScriptProject: true,
      isLikelyNextProject,
      hasNextEnvFile,
      hasNextEnvTypeConfig,
      hasGeneratedRouteTypeConfig,
      hasRequiredTypeConfig,
      hasGeneratedRouteTypes,
      missingGeneratedRouteTypes:
        hasRequiredTypeConfig && !hasGeneratedRouteTypes,
    }
  } catch {
    return {
      tsConfigFilePath,
      isTypeScriptProject: true,
      isLikelyNextProject: hasNextEnvFile,
      hasNextEnvFile,
      hasNextEnvTypeConfig: false,
      hasGeneratedRouteTypeConfig: false,
      hasRequiredTypeConfig: false,
      hasGeneratedRouteTypes: false,
      missingGeneratedRouteTypes: false,
    }
  }
}

export function getMissingNextGeneratedTypesConfigWarning(
  status: NextGeneratedTypesStatus
): string | undefined {
  if (
    !status.isTypeScriptProject ||
    !status.isLikelyNextProject ||
    status.hasRequiredTypeConfig
  ) {
    return undefined
  }

  return (
    'Next.js route-aware types are not fully configured in tsconfig include. ' +
    'Add "next-env.d.ts" and ".next/types/**/*.ts" if you use PageProps, LayoutProps, or RouteContext.'
  )
}

export function getNextRouteAwareTypesDiagnosticHelp(options: {
  sourceFile: SourceFile
  diagnostics: Diagnostic<ts.Diagnostic>[]
}): string | undefined {
  const configFilePath = (options.sourceFile.getProject().getCompilerOptions() as {
    configFilePath?: string
  }).configFilePath

  if (typeof configFilePath !== 'string' || configFilePath.length === 0) {
    return undefined
  }

  const status = getNextGeneratedTypesStatus({
    rootPath: dirname(configFilePath),
    tsConfigFilePath: configFilePath,
  })

  if (!status.isLikelyNextProject) {
    return undefined
  }

  const missingHelpers = new Set<string>()

  for (const diagnostic of options.diagnostics) {
    const message = getDiagnosticMessageText(diagnostic.getMessageText())
    const match = NEXT_ROUTE_AWARE_HELPER_DIAGNOSTIC_RE.exec(message)

    if (match?.[1]) {
      missingHelpers.add(match[1])
    }
  }

  if (missingHelpers.size === 0) {
    return undefined
  }

  const formattedHelpers = formatValueList(Array.from(missingHelpers))

  if (status.missingGeneratedRouteTypes) {
    return (
      'This looks like a Next.js route-aware type generation issue. ' +
      `TypeScript cannot resolve ${formattedHelpers} because Next's generated route types are not available yet. ` +
      'Run "next typegen", "next dev", or "next build" before rendering this snippet.'
    )
  }

  if (!status.hasRequiredTypeConfig) {
    return (
      'This looks like a Next.js route-aware type configuration issue. ' +
      `TypeScript cannot resolve ${formattedHelpers} because this project's tsconfig does not fully include Next's generated route types. ` +
      'Add "next-env.d.ts" and ".next/types/**/*.ts" to tsconfig.json#include, then rerun "next typegen", "next dev", or "next build".'
    )
  }

  return undefined
}
