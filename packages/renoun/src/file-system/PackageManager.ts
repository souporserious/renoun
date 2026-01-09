import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  PACKAGE_MANAGERS,
  isPackageManagerName,
  type PackageManagerName,
} from './PackageManager.shared.ts'

export {
  PACKAGE_MANAGERS,
  type PackageManagerName,
} from './PackageManager.shared.ts'

export type CommandVariant =
  | 'install'
  | 'install-dev'
  | 'run'
  | 'exec'
  | 'create'

export interface DetectOptions {
  /** Working directory to detect from. Defaults to process.cwd() */
  cwd?: string
  /** Whether to traverse up directories looking for lockfiles. Defaults to true */
  traverse?: boolean
  /** Whether to fall back to checking global availability. Defaults to true */
  fallbackToAvailable?: boolean
}

export type DetectionSource =
  | 'packageManager-field'
  | 'lockfile'
  | 'available'
  | 'default'

const cache = {
  available: new Map<PackageManagerName, boolean>(),
  versions: new Map<PackageManagerName, string | null>(),
  detected: new Map<
    string,
    { name: PackageManagerName; source: DetectionSource; version?: string }
  >(),
}

/**
 * Lockfiles used to infer the workspace package manager.
 *
 * Order matters: this is treated as a priority list when multiple lockfiles
 * exist.
 */
export const LOCKFILE_CANDIDATES: ReadonlyArray<
  readonly [filename: string, manager: PackageManagerName]
> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['shrinkwrap.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
] as const

const INSTALL_BASE: Record<PackageManagerName, string> = {
  npm: 'npm install',
  pnpm: 'pnpm add',
  yarn: 'yarn add',
  bun: 'bun add',
}

const INSTALL_DEV_FLAGS: Record<PackageManagerName, string> = {
  npm: '--save-dev',
  pnpm: '--save-dev',
  yarn: '--dev',
  bun: '--dev',
}

const RUN_PREFIX: Record<PackageManagerName, string> = {
  npm: 'npm run',
  pnpm: 'pnpm',
  yarn: 'yarn',
  bun: 'bun run',
}

const EXEC_PREFIX: Record<PackageManagerName, string> = {
  npm: 'npx',
  pnpm: 'pnpm dlx',
  yarn: 'yarn dlx',
  bun: 'bunx',
}

const CREATE_PREFIX: Record<PackageManagerName, string> = {
  npm: 'npm create',
  pnpm: 'pnpm create',
  yarn: 'yarn create',
  bun: 'bun create',
}

/**
 * Parse the "packageManager" field from package.json.
 *
 * @example
 * parsePackageManagerField('pnpm@9.0.0') -> { name: 'pnpm', version: '9.0.0' }
 */
export function parsePackageManagerField(
  value: string
): { name: PackageManagerName; version: string } | null {
  const match = value.match(/^([a-z]+)@(.+?)(?:\+.*)?$/i)
  if (!match) {
    return null
  }

  const [, name, version] = match
  if (!isPackageManagerName(name)) {
    return null
  }

  return { name, version }
}

function commandExists(command: string): boolean {
  try {
    execSync(
      process.platform === 'win32'
        ? `where ${command}`
        : `command -v ${command}`,
      { stdio: 'ignore' }
    )
    return true
  } catch {
    return false
  }
}

function getVersion(pm: PackageManagerName): string | null {
  if (cache.versions.has(pm)) {
    return cache.versions.get(pm)!
  }

  try {
    const version = execSync(`${pm} --version`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()

    cache.versions.set(pm, version)
    return version
  } catch {
    cache.versions.set(pm, null)
    return null
  }
}

function checkAvailable(pm: PackageManagerName): boolean {
  if (cache.available.has(pm)) {
    return cache.available.get(pm)!
  }

  const available = commandExists(pm)
  cache.available.set(pm, available)
  return available
}

function detectFromPackageJson(
  cwd: string
): { name: PackageManagerName; version?: string } | null {
  const packageJsonPath = join(cwd, 'package.json')

  if (!existsSync(packageJsonPath)) {
    return null
  }

  try {
    const content = readFileSync(packageJsonPath, 'utf8')
    const pkg = JSON.parse(content)

    if (typeof pkg.packageManager === 'string') {
      const parsed = parsePackageManagerField(pkg.packageManager)
      if (parsed) {
        return parsed
      }
    }
  } catch {
    // Invalid JSON or read error
  }

  return null
}

function detectFromLockfile(cwd: string): PackageManagerName | null {
  for (const [filename, pm] of LOCKFILE_CANDIDATES) {
    if (existsSync(join(cwd, filename))) return pm
  }
  return null
}

function findUpLockfile(startDir: string): PackageManagerName | null {
  let current = resolve(startDir)
  const root = resolve('/')

  while (current !== root) {
    const result = detectFromLockfile(current)
    if (result) {
      return result
    }

    const parent = resolve(current, '..')
    if (parent === current) break
    current = parent
  }

  return null
}

function detect(options: DetectOptions = {}): {
  name: PackageManagerName
  source: DetectionSource
  version?: string
} {
  const {
    cwd = process.cwd(),
    traverse = true,
    fallbackToAvailable = true,
  } = options
  const resolvedCwd = resolve(cwd)
  const cacheKey = `${resolvedCwd}:${traverse}:${fallbackToAvailable}`

  if (cache.detected.has(cacheKey)) {
    return cache.detected.get(cacheKey)!
  }

  const fromField = detectFromPackageJson(resolvedCwd)
  if (fromField) {
    const result = { ...fromField, source: 'packageManager-field' as const }
    cache.detected.set(cacheKey, result)
    return result
  }

  const fromLockfile = detectFromLockfile(resolvedCwd)
  if (fromLockfile) {
    const result = { name: fromLockfile, source: 'lockfile' as const }
    cache.detected.set(cacheKey, result)
    return result
  }

  if (traverse) {
    const fromParent = findUpLockfile(resolve(resolvedCwd, '..'))
    if (fromParent) {
      const result = { name: fromParent, source: 'lockfile' as const }
      cache.detected.set(cacheKey, result)
      return result
    }
  }

  if (fallbackToAvailable) {
    const preferred: PackageManagerName[] = ['pnpm', 'yarn', 'bun', 'npm']
    for (const pm of preferred) {
      if (checkAvailable(pm)) {
        const result = { name: pm, source: 'available' as const }
        cache.detected.set(cacheKey, result)
        return result
      }
    }
  }

  const result = { name: 'npm' as const, source: 'default' as const }
  cache.detected.set(cacheKey, result)
  return result
}

export class PackageManager {
  /** The package manager name */
  readonly name: PackageManagerName

  /** How this package manager was detected (only set when detected) */
  readonly source?: DetectionSource

  /** The version constraint from package.json (only set when source is 'packageManager-field') */
  readonly constraint?: string

  /**
   * Create a PackageManager instance.
   *
   * @param nameOrOptions - Either a package manager name ('npm', 'pnpm', 'yarn', 'bun')
   *                        or detection options. If omitted, detects automatically.
   *
   * @example
   * // Detect automatically
   * const pm = new PackageManager()
   *
   * // Detect with options
   * const pm = new PackageManager({ cwd: './my-app' })
   *
   * // Use specific package manager
   * const pm = new PackageManager('pnpm')
   */
  constructor(nameOrOptions?: PackageManagerName | DetectOptions) {
    if (typeof nameOrOptions === 'string') {
      if (!isPackageManagerName(nameOrOptions)) {
        throw new Error(`Invalid package manager: ${nameOrOptions}`)
      }
      this.name = nameOrOptions
    } else {
      const result = detect(nameOrOptions)
      this.name = result.name
      this.source = result.source
      this.constraint = result.version
    }
  }

  /**
   * Get all package managers available on the system.
   */
  static getAvailable(): PackageManager[] {
    return PACKAGE_MANAGERS.filter(checkAvailable).map(
      (name) => new PackageManager(name)
    )
  }

  /**
   * Get all package managers (available or not).
   */
  static getAll(): PackageManager[] {
    return PACKAGE_MANAGERS.map((name) => new PackageManager(name))
  }

  /**
   * Clear the internal cache.
   */
  static clearCache(): void {
    cache.available.clear()
    cache.versions.clear()
    cache.detected.clear()
  }

  /**
   * Check if a value is a valid package manager name.
   */
  static isValid(value: unknown): value is PackageManagerName {
    return isPackageManagerName(value)
  }

  /** Check if this package manager is available on the system */
  isAvailable(): boolean {
    return checkAvailable(this.name)
  }

  /** Get the installed version of this package manager */
  getVersion(): string | null {
    return getVersion(this.name)
  }

  /** Build a command for a given variant */
  command(variant: CommandVariant, subject: string): string {
    const parts: string[] = []

    switch (variant) {
      case 'install':
        parts.push(INSTALL_BASE[this.name], subject)
        break
      case 'install-dev':
        parts.push(
          INSTALL_BASE[this.name],
          INSTALL_DEV_FLAGS[this.name],
          subject
        )
        break
      case 'run':
        parts.push(RUN_PREFIX[this.name], subject)
        break
      case 'exec':
        parts.push(EXEC_PREFIX[this.name], subject)
        break
      case 'create':
        parts.push(CREATE_PREFIX[this.name], subject)
        break
    }

    return parts.filter(Boolean).join(' ')
  }

  /** Build an install command */
  install(packages: string | string[], options?: { dev?: boolean }): string {
    const subject = Array.isArray(packages) ? packages.join(' ') : packages
    return this.command(options?.dev ? 'install-dev' : 'install', subject)
  }

  /** Build a run command */
  run(script: string, args?: string): string {
    const subject = args ? `${script} ${args}` : script
    return this.command('run', subject)
  }

  /** Build an exec/dlx command */
  exec(binary: string, args?: string): string {
    const subject = args ? `${binary} ${args}` : binary
    return this.command('exec', subject)
  }

  /** Build a create command */
  create(template: string, args?: string): string {
    const subject = args ? `${template} ${args}` : template
    return this.command('create', subject)
  }

  /** Get the base install command (e.g., "pnpm add") */
  get installBase(): string {
    return INSTALL_BASE[this.name]
  }

  /** Get the dev flag (e.g., "--save-dev") */
  get devFlag(): string {
    return INSTALL_DEV_FLAGS[this.name]
  }

  /** Get the run prefix (e.g., "pnpm") */
  get runPrefix(): string {
    return RUN_PREFIX[this.name]
  }

  /** Get the exec prefix (e.g., "pnpm dlx") */
  get execPrefix(): string {
    return EXEC_PREFIX[this.name]
  }

  /** Get the create prefix (e.g., "pnpm create") */
  get createPrefix(): string {
    return CREATE_PREFIX[this.name]
  }
}
