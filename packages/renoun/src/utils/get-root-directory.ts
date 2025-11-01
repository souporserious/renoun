import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { cwd } from 'node:process'

const rootDirectoryCache: Map<string, string> = new Map()

/** Resolve the root of the workspace, using bun, npm, pnpm, or yarn. */
export function getRootDirectory(startDirectory: string = cwd()): string {
  if (rootDirectoryCache.has(startDirectory)) {
    return rootDirectoryCache.get(startDirectory)!
  }

  const checkedDirectories: string[] = []
  let currentDirectory = resolve(startDirectory)
  let packageJsonDirectory: string | null = null

  while (true) {
    const pnpmWorkspacePath = join(currentDirectory, 'pnpm-workspace.yaml')
    checkedDirectories.push(currentDirectory)

    // Check for pnpm workspace configuration
    if (existsSync(pnpmWorkspacePath)) {
      rootDirectoryCache.set(startDirectory, currentDirectory)
      return currentDirectory
    }

    // Read and parse package.json directly
    try {
      const packageJsonPath = join(currentDirectory, 'package.json')
      const packageJsonContent = readFileSync(packageJsonPath, 'utf-8')
      const { workspaces } = JSON.parse(packageJsonContent)

      if (
        workspaces &&
        (Array.isArray(workspaces) || typeof workspaces === 'object')
      ) {
        rootDirectoryCache.set(startDirectory, currentDirectory)
        return currentDirectory
      } else if (packageJsonDirectory === null) {
        packageJsonDirectory = currentDirectory
      }
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code !== 'ENOENT'
      ) {
        throw error
      }
    }

    // Move up to the parent directory
    const parentDirectory = dirname(currentDirectory)

    // Check if we've reached the root of the file system
    if (parentDirectory === currentDirectory) {
      break
    }

    currentDirectory = parentDirectory
  }

  // If no monorepo root workspace was found, return the directory containing the nearest package.json found
  if (packageJsonDirectory) {
    rootDirectoryCache.set(startDirectory, packageJsonDirectory)
    return packageJsonDirectory
  }

  const lines: string[] = []
  lines.push('[renoun] Workspace root directory could not be found.')
  lines.push('')
  lines.push('What we tried:')
  lines.push(`  • Started from: ${resolve(startDirectory)}`)
  lines.push('  • Looked for:')
  lines.push('      - pnpm-workspace.yaml')
  lines.push("      - package.json with a 'workspaces' field")
  lines.push('  • Checked directories (top to root):')
  for (const directory of checkedDirectories) {
    lines.push(`      - ${directory}`)
  }
  lines.push('')
  lines.push('How to fix:')
  lines.push(
    "  • If deploying to serverless/edge (e.g. Vercel, Netlify, Cloudflare, AWS Lambda/Edge), this code is running where your repo files aren't available at runtime. Move this call to a Node.js runtime or run it at build time."
  )
  lines.push(
    '  • Next.js: set \'export const runtime = "nodejs"\' in any page/layout/route that uses renoun, or precompute data during build (e.g. SSG).'
  )
  lines.push(
    '  • On Edge runtimes, avoid filesystem access at request-time; precompute and import static data instead.'
  )
  lines.push(
    '  • Ensure your deployment includes a workspace manifest at the repo root (pnpm-workspace.yaml or a package.json with a workspaces field) if you run on a server with access to the repo.'
  )
  lines.push('')
  lines.push(
    'If this persists, enable debug logging with RENOUN_DEBUG=debug to print more context.'
  )

  throw new Error(lines.join('\n'))
}
