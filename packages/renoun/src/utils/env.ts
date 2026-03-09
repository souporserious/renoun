import { PROCESS_ENV_KEYS } from './env-keys.ts'

function readProcessEnv(key: string): string | undefined {
  const env = globalThis.process?.env
  return typeof env === 'object' && env !== null ? env[key] : undefined
}

function readProcessArgv(): string[] {
  const argv = globalThis.process?.argv
  return Array.isArray(argv) ? argv : []
}

export function parseBooleanEnv(
  value: string | undefined,
  options: {
    allowYesNo?: boolean
  } = {}
): boolean | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (
    normalized === '1' ||
    normalized === 'true' ||
    (options.allowYesNo === true && normalized === 'yes')
  ) {
    return true
  }

  if (
    normalized === '0' ||
    normalized === 'false' ||
    (options.allowYesNo === true && normalized === 'no')
  ) {
    return false
  }

  return undefined
}

export function resolveBooleanEnv(
  value: string | undefined,
  fallback: boolean,
  options: {
    allowYesNo?: boolean
  } = {}
): boolean {
  const parsed = parseBooleanEnv(value, options)
  return parsed === undefined ? fallback : parsed
}

export function resolveBooleanProcessEnv(
  key: string,
  fallback: boolean,
  options: {
    allowYesNo?: boolean
  } = {}
): boolean {
  return resolveBooleanEnv(readProcessEnv(key), fallback, options)
}

export function parseBooleanProcessEnv(
  key: string,
  options: {
    allowYesNo?: boolean
  } = {}
): boolean | undefined {
  return parseBooleanEnv(readProcessEnv(key), options)
}

export function readNonEmptyProcessEnv(key: string): string | undefined {
  const value = readProcessEnv(key)
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function parseIntegerEnv(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parseIntegerProcessEnv(key: string): number | undefined {
  return parseIntegerEnv(readProcessEnv(key))
}

export function parsePositiveIntegerEnv(
  value: string | undefined
): number | undefined {
  const parsed = parseIntegerEnv(value)
  if (parsed === undefined || parsed <= 0) {
    return undefined
  }

  return parsed
}

export function resolvePositiveIntegerEnv(
  value: string | undefined,
  fallback: number
): number {
  const parsed = parsePositiveIntegerEnv(value)
  return parsed === undefined ? fallback : parsed
}

export function resolvePositiveIntegerProcessEnv(
  key: string,
  fallback: number
): number {
  return resolvePositiveIntegerEnv(readProcessEnv(key), fallback)
}

export function parseNonNegativeIntegerEnv(
  value: string | undefined
): number | undefined {
  const parsed = parseIntegerEnv(value)
  if (parsed === undefined || parsed < 0) {
    return undefined
  }

  return parsed
}

export function parseNonNegativeIntegerProcessEnv(
  key: string
): number | undefined {
  return parseNonNegativeIntegerEnv(readProcessEnv(key))
}

export function resolveNonNegativeIntegerEnv(
  value: string | undefined,
  fallback: number
): number {
  const parsed = parseNonNegativeIntegerEnv(value)
  return parsed === undefined ? fallback : parsed
}

export function resolveNonNegativeIntegerProcessEnv(
  key: string,
  fallback: number
): number {
  return resolveNonNegativeIntegerEnv(readProcessEnv(key), fallback)
}

export function isNodeEnv(value: 'development' | 'production' | 'test'): boolean {
  return readProcessEnv(PROCESS_ENV_KEYS.nodeEnv) === value
}

export function isDevelopmentEnvironment(): boolean {
  return isNodeEnv('development')
}

export function isProductionEnvironment(): boolean {
  return isNodeEnv('production')
}

export function isTestEnvironment(): boolean {
  return isNodeEnv('test')
}

export function isVitestRuntime(): boolean {
  return (
    readProcessEnv(PROCESS_ENV_KEYS.vitest) !== undefined ||
    readProcessEnv(PROCESS_ENV_KEYS.vitestWorkerId) !== undefined ||
    isNodeEnv('test') ||
    readProcessArgv().some((argument) => argument.includes('vitest'))
  )
}

export function isCiEnvironment(): boolean {
  return readProcessEnv(PROCESS_ENV_KEYS.ci) !== undefined
}

export function isStrictHermeticFileSystemModeFromEnv(): boolean {
  return isProductionEnvironment()
}

export function isRenounDebugEnabled(): boolean {
  const rawValue = readProcessEnv(PROCESS_ENV_KEYS.renounDebug)
  const normalized = String(rawValue ?? '').toLowerCase()
  return (
    rawValue !== undefined &&
    normalized !== '0' &&
    normalized !== 'false'
  )
}
