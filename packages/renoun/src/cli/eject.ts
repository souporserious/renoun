import { existsSync, readdirSync, rmSync } from 'node:fs'
import { cp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { getDebugLogger } from '../utils/debug.ts'

interface EjectOptions {
  /** Optional app name to eject. If not provided, auto-detects from dependencies. */
  appName?: string

  /** Target directory to eject into. Defaults to project root. */
  targetDirectory?: string
}

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  '.output',
  '.renoun',
  'dist',
  'out',
])

const IGNORED_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
])

/**
 * Ejects a renoun app from node_modules into the project root.
 * This copies the app's files into your project and removes the dependency.
 */
export async function runEjectCommand(
  options: EjectOptions = {}
): Promise<void> {
  const projectRoot = process.cwd()
  const projectPackageJsonPath = join(projectRoot, 'package.json')

  if (!existsSync(projectPackageJsonPath)) {
    throw new Error('[renoun] No package.json found in current directory.')
  }

  const projectPackageJson = JSON.parse(
    await readFile(projectPackageJsonPath, 'utf-8')
  ) as Record<string, unknown>

  const projectRequire = createRequire(projectPackageJsonPath)

  // Find the app to eject
  const appName =
    options.appName ??
    (await findAppToEject(projectPackageJson, projectRequire))

  if (!appName) {
    throw new Error(
      '[renoun] Could not find a renoun app to eject. ' +
        'Ensure you have a renoun app installed (e.g., @renoun/blog) or specify one explicitly.'
    )
  }

  console.log(`[renoun] Ejecting ${appName}...`)

  // Resolve the app package
  let appPackagePath: string
  try {
    appPackagePath = projectRequire.resolve(`${appName}/package.json`)
  } catch {
    throw new Error(
      `[renoun] Could not find package "${appName}". Is it installed?`
    )
  }

  const appRoot = join(appPackagePath, '..')
  const appPackageJson = JSON.parse(
    await readFile(appPackagePath, 'utf-8')
  ) as Record<string, unknown>

  const targetDirectory = options.targetDirectory ?? projectRoot

  // Copy app files to the project, respecting existing files (overrides win)
  await copyAppFiles(appRoot, targetDirectory)

  // Update package.json: remove the app dependency, keep renoun
  await updatePackageJson(
    projectPackageJsonPath,
    projectPackageJson,
    appName,
    appPackageJson
  )

  // Clean up .renoun directory if it exists
  const renounDir = join(projectRoot, '.renoun')
  if (existsSync(renounDir)) {
    try {
      rmSync(renounDir, { recursive: true, force: true })
      console.log('  Cleaned up .renoun/ directory')
    } catch {
      console.log('  Note: Could not remove .renoun/ directory')
    }
  }

  console.log(`[renoun] Successfully ejected ${appName}!`)
  console.log('')
  console.log('Next steps:')
  console.log('  1. Update your package.json scripts to use framework mode:')
  console.log('     "dev": "renoun next dev"')
  console.log('     "build": "renoun next build"')
  console.log('')
  console.log('  2. Run `pnpm install` to update your dependencies.')
}

async function findAppToEject(
  packageJson: Record<string, unknown>,
  projectRequire: NodeRequire
): Promise<string | undefined> {
  const deps = packageJson['dependencies'] as Record<string, string> | undefined
  const devDeps = packageJson['devDependencies'] as
    | Record<string, string>
    | undefined

  const allDependencies = {
    ...deps,
    ...devDeps,
  }

  for (const depName of Object.keys(allDependencies)) {
    try {
      const depPackagePath = projectRequire.resolve(`${depName}/package.json`)
      const depPackageJson = JSON.parse(
        await readFile(depPackagePath, 'utf-8')
      ) as Record<string, unknown>

      // Check if this dependency has renoun as a dependency (making it a renoun app)
      const depDeps = depPackageJson['dependencies'] as
        | Record<string, string>
        | undefined
      const depDevDeps = depPackageJson['devDependencies'] as
        | Record<string, string>
        | undefined
      const depPeerDeps = depPackageJson['peerDependencies'] as
        | Record<string, string>
        | undefined

      const depDependencies = {
        ...depDeps,
        ...depDevDeps,
        ...depPeerDeps,
      }

      if ('renoun' in depDependencies) {
        return depName
      }
    } catch {
      // Skip packages we can't resolve
      continue
    }
  }

  return undefined
}

async function copyAppFiles(
  appRoot: string,
  targetDirectory: string
): Promise<void> {
  const entries = readdirSync(appRoot, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = join(appRoot, entry.name)
    const targetPath = join(targetDirectory, entry.name)

    // Skip ignored directories and files
    if (IGNORED_DIRECTORIES.has(entry.name) || IGNORED_FILES.has(entry.name)) {
      continue
    }

    // Check if the target already exists (project file/directory overrides app)
    if (existsSync(targetPath)) {
      getDebugLogger().debug('Skipping (overridden by project)', () => ({
        data: { path: entry.name },
      }))
      console.log(`  Keeping existing: ${entry.name}`)
      continue
    }

    // Copy the file/directory
    if (entry.isDirectory()) {
      await cp(sourcePath, targetPath, { recursive: true })
      console.log(`  Copied directory: ${entry.name}/`)
    } else if (entry.isFile()) {
      await cp(sourcePath, targetPath)
      console.log(`  Copied file: ${entry.name}`)
    }
  }
}

async function updatePackageJson(
  packageJsonPath: string,
  packageJson: Record<string, unknown>,
  appName: string,
  appPackageJson: Record<string, unknown>
): Promise<void> {
  const updated = { ...packageJson }

  const SECTION_KEYS = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
  ] as const

  function readSection(
    value: unknown
  ): Record<string, string> {
    if (!value || typeof value !== 'object') return {}
    return { ...(value as Record<string, string>) }
  }

  function getExistingVersion(name: string): {
    section: (typeof SECTION_KEYS)[number]
    version: string
  } | null {
    for (const sectionKey of SECTION_KEYS) {
      const record = readSection(updated[sectionKey])
      const version = record[name]
      if (typeof version === 'string') {
        return { section: sectionKey, version }
      }
    }
    return null
  }

  // Remove the app from dependencies
  const deps = updated['dependencies']
  if (deps && typeof deps === 'object') {
    const depsRecord = { ...(deps as Record<string, string>) }
    delete depsRecord[appName]
    updated['dependencies'] = depsRecord
  }

  const devDeps = updated['devDependencies']
  if (devDeps && typeof devDeps === 'object') {
    const devDepsRecord = { ...(devDeps as Record<string, string>) }
    delete devDepsRecord[appName]
    updated['devDependencies'] = devDepsRecord
  }

  // Merge app's dependency blocks into the project so the ejected app can build/run.
  // We avoid overwriting user versions, but we warn when conflicts are detected.
  const conflicts: Array<{
    name: string
    appSection: (typeof SECTION_KEYS)[number]
    appVersion: string
    projectSection: (typeof SECTION_KEYS)[number]
    projectVersion: string
  }> = []

  for (const sectionKey of SECTION_KEYS) {
    const appRecord = readSection(appPackageJson[sectionKey])
    if (Object.keys(appRecord).length === 0) continue

    const projectRecord = readSection(updated[sectionKey])

    for (const [name, version] of Object.entries(appRecord)) {
      if (name === 'renoun' || name === appName) continue
      if (typeof version !== 'string') continue

      const existing = getExistingVersion(name)
      if (existing) {
        if (existing.version !== version) {
          conflicts.push({
            name,
            appSection: sectionKey,
            appVersion: version,
            projectSection: existing.section,
            projectVersion: existing.version,
          })
        }
        continue
      }

      projectRecord[name] = version
    }

    updated[sectionKey] = projectRecord
  }

  if (conflicts.length > 0) {
    getDebugLogger().warn('Dependency version conflicts detected during eject', () => ({
      data: {
        conflictCount: conflicts.length,
        conflicts: conflicts.slice(0, 25),
      },
    }))
    console.log('  Note: Dependency version conflicts detected during eject.')
    console.log(
      '  Existing project versions were kept. If you hit runtime/build issues, align these versions.'
    )
  }

  await writeFile(packageJsonPath, JSON.stringify(updated, null, 2) + '\n')
  console.log('  Updated package.json')
}
