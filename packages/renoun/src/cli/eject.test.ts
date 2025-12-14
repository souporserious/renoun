import { realpathSync } from 'node:fs'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
  stat,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { runEjectCommand } from './eject.ts'

const BLOG_EXAMPLE_PATH = fileURLToPath(
  new URL('../../../../examples/blog', import.meta.url)
)

let originalCwd: string
let consoleLogs: string[]

beforeEach(() => {
  originalCwd = process.cwd()
  consoleLogs = []
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    consoleLogs.push(args.join(' '))
  })
})

afterEach(() => {
  process.chdir(originalCwd)
  vi.restoreAllMocks()
})

describe('runEjectCommand', () => {
  test('ejects app files to project root and updates package.json', async () => {
    // Use realpathSync to resolve symlinks (e.g., /var -> /private/var on macOS)
    const tmpRoot = realpathSync(
      await mkdtemp(join(tmpdir(), 'renoun-eject-test-'))
    )
    const projectRoot = join(tmpRoot, 'project')
    await mkdir(projectRoot, { recursive: true })

    // Set up node_modules with the blog example
    const nodeModulesExampleDir = join(
      projectRoot,
      'node_modules',
      '@renoun',
      'blog'
    )
    await mkdir(nodeModulesExampleDir, { recursive: true })
    await cp(BLOG_EXAMPLE_PATH, nodeModulesExampleDir, { recursive: true })

    // Create project package.json with the app as a dependency
    const projectPackageJson = {
      name: 'eject-test',
      version: '1.0.0',
      dependencies: {
        '@renoun/blog': 'workspace:*',
        renoun: 'workspace:*',
      },
    }
    await writeFile(
      join(projectRoot, 'package.json'),
      JSON.stringify(projectPackageJson, null, 2)
    )

    // Create a shadow file that should be preserved
    const postsDirectory = join(projectRoot, 'posts')
    await mkdir(postsDirectory, { recursive: true })
    await writeFile(join(postsDirectory, 'my-post.mdx'), '# My Post\n')

    // Create a .renoun directory to verify cleanup
    const renounDir = join(projectRoot, '.renoun')
    await mkdir(renounDir, { recursive: true })
    await writeFile(join(renounDir, 'cache.json'), '{}')

    process.chdir(projectRoot)

    try {
      await runEjectCommand({ appName: '@renoun/blog' })

      // Verify the app was copied
      const appDirStat = await stat(join(projectRoot, 'app')).catch(() => null)
      expect(appDirStat?.isDirectory()).toBe(true)

      // Verify shadow file was preserved (posts/ should still be our version)
      const myPostContent = await readFile(
        join(projectRoot, 'posts', 'my-post.mdx'),
        'utf-8'
      )
      expect(myPostContent).toBe('# My Post\n')

      // Verify package.json was updated
      const updatedPackageJson = JSON.parse(
        await readFile(join(projectRoot, 'package.json'), 'utf-8')
      )
      expect(updatedPackageJson.dependencies['@renoun/blog']).toBeUndefined()
      expect(updatedPackageJson.dependencies['renoun']).toBe('workspace:*')

      // Verify .renoun was cleaned up
      const renounDirExists = await stat(renounDir).catch(() => null)
      expect(renounDirExists).toBe(null)

      // Verify console output
      expect(
        consoleLogs.some((log) => log.includes('Ejecting @renoun/blog'))
      ).toBe(true)
      expect(
        consoleLogs.some((log) => log.includes('Successfully ejected'))
      ).toBe(true)
      expect(
        consoleLogs.some((log) => log.includes('Keeping existing: posts'))
      ).toBe(true)
      expect(
        consoleLogs.some((log) => log.includes('Cleaned up .renoun/'))
      ).toBe(true)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  test('auto-detects renoun app from dependencies', async () => {
    const tmpRoot = realpathSync(
      await mkdtemp(join(tmpdir(), 'renoun-eject-autodetect-'))
    )
    const projectRoot = join(tmpRoot, 'project')
    await mkdir(projectRoot, { recursive: true })

    // Set up node_modules with the blog example
    const nodeModulesExampleDir = join(
      projectRoot,
      'node_modules',
      '@renoun',
      'blog'
    )
    await mkdir(nodeModulesExampleDir, { recursive: true })
    await cp(BLOG_EXAMPLE_PATH, nodeModulesExampleDir, { recursive: true })

    // Create project package.json
    const projectPackageJson = {
      name: 'autodetect-test',
      version: '1.0.0',
      dependencies: {
        '@renoun/blog': 'workspace:*',
        renoun: 'workspace:*',
      },
    }
    await writeFile(
      join(projectRoot, 'package.json'),
      JSON.stringify(projectPackageJson, null, 2)
    )

    process.chdir(projectRoot)

    try {
      // Don't specify appName - should auto-detect
      await runEjectCommand({})

      // Verify it detected and ejected @renoun/blog
      expect(
        consoleLogs.some((log) => log.includes('Ejecting @renoun/blog'))
      ).toBe(true)
      expect(
        consoleLogs.some((log) => log.includes('Successfully ejected'))
      ).toBe(true)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  test('throws error when no app is found', async () => {
    const tmpRoot = realpathSync(
      await mkdtemp(join(tmpdir(), 'renoun-eject-noapp-'))
    )
    const projectRoot = join(tmpRoot, 'project')
    await mkdir(projectRoot, { recursive: true })

    // Create project package.json without any renoun app
    const projectPackageJson = {
      name: 'no-app-test',
      version: '1.0.0',
      dependencies: {
        renoun: 'workspace:*',
      },
    }
    await writeFile(
      join(projectRoot, 'package.json'),
      JSON.stringify(projectPackageJson, null, 2)
    )

    process.chdir(projectRoot)

    try {
      await expect(runEjectCommand({})).rejects.toThrow(
        'Could not find a renoun app to eject'
      )
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  test('throws error when specified app is not installed', async () => {
    const tmpRoot = realpathSync(
      await mkdtemp(join(tmpdir(), 'renoun-eject-notfound-'))
    )
    const projectRoot = join(tmpRoot, 'project')
    await mkdir(projectRoot, { recursive: true })

    const projectPackageJson = {
      name: 'not-found-test',
      version: '1.0.0',
      dependencies: {
        renoun: 'workspace:*',
      },
    }
    await writeFile(
      join(projectRoot, 'package.json'),
      JSON.stringify(projectPackageJson, null, 2)
    )

    process.chdir(projectRoot)

    try {
      await expect(
        runEjectCommand({ appName: '@renoun/nonexistent' })
      ).rejects.toThrow('Could not find package "@renoun/nonexistent"')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })
})
