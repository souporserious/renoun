import { PROCESS_ENV_KEYS } from './env-keys.ts'

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
  return resolveBooleanEnv(process.env[key], fallback, options)
}

export function parseIntegerEnv(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
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
  return resolvePositiveIntegerEnv(process.env[key], fallback)
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
  return resolveNonNegativeIntegerEnv(process.env[key], fallback)
}

export function isNodeEnv(value: 'development' | 'production' | 'test'): boolean {
  return process.env[PROCESS_ENV_KEYS.nodeEnv] === value
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
    process.env[PROCESS_ENV_KEYS.vitest] !== undefined ||
    process.env[PROCESS_ENV_KEYS.vitestWorkerId] !== undefined ||
    isNodeEnv('test') ||
    process.argv.some((argument) => argument.includes('vitest'))
  )
}

export function isCiEnvironment(): boolean {
  return process.env[PROCESS_ENV_KEYS.ci] !== undefined
}

export function isStrictHermeticFileSystemModeFromEnv(): boolean {
  const override = parseBooleanEnv(
    process.env[PROCESS_ENV_KEYS.renounFsStrictHermetic]
  )
  if (override !== undefined) {
    return override
  }

  return isProductionEnvironment()
}
