import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { glob } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'

interface OverrideOptions {
  /** The file or glob pattern to override from the app template (e.g., "tsconfig.json" or "ui/*.tsx"). */
  pattern: string

  /** Optional app name. If not provided, auto-detects from dependencies. */
  appName?: string
}

/**
 * Copies files from the installed app template to the project root.
 * Supports glob patterns for copying multiple files at once.
 * This provides IDE support and allows customization without fully ejecting the app.
 */
export async function runOverrideCommand(
  options: OverrideOptions
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

  // Find the app to override from
  const appName =
    options.appName ??
    (await findAppToOverride(projectPackageJson, projectRequire))

  if (!appName) {
    throw new Error(
      '[renoun] Could not find a renoun app to override from. ' +
        'Ensure you have a renoun app installed (e.g., @renoun/workbench) or specify one explicitly.'
    )
  }

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

  // Use glob to find matching files
  const globPattern = join(appRoot, options.pattern)
  const matchedFiles: string[] = []

  for await (const entry of glob(globPattern)) {
    matchedFiles.push(entry)
  }

  if (matchedFiles.length === 0) {
    throw new Error(
      `[renoun] No files matching "${options.pattern}" found in ${appName}.`
    )
  }

  let copiedCount = 0

  for (const sourceFile of matchedFiles) {
    const relativePath = relative(appRoot, sourceFile)
    const targetFile = join(projectRoot, relativePath)

    // Ensure target directory exists
    const targetDir = dirname(targetFile)
    if (!existsSync(targetDir)) {
      await mkdir(targetDir, { recursive: true })
    }

    // Check if the target already exists
    const existed = existsSync(targetFile)

    await copyFile(sourceFile, targetFile)
    copiedCount++

    if (existed) {
      console.log(`  Overwrote: ${relativePath}`)
    } else {
      console.log(`  Created: ${relativePath}`)
    }
  }

  console.log(
    `[renoun] Copied ${copiedCount} file${copiedCount === 1 ? '' : 's'} from ${appName}.`
  )
}

async function findAppToOverride(
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
