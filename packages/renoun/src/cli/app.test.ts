import { EventEmitter } from 'node:events'
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import {
  cp,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'

import { PROCESS_ENV_KEYS } from '../utils/env-keys.ts'
import { captureProcessEnv, restoreProcessEnv } from '../utils/test.ts'
import { DEFAULT_BUILD_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS } from './build-analysis-runtime.ts'

const BLOG_APP_PATH = fileURLToPath(
  new URL('../../../../apps/blog', import.meta.url)
)

type WatchRegistration = {
  directory: string
  listener: (eventType: string, fileName: string | Buffer | null) => void
  watcher: {
    close: ReturnType<typeof vi.fn>
  }
}

const watchRegistrations: WatchRegistration[] = []
const watchMock = vi.fn(
  (
    directory: string | Buffer | URL,
    options: unknown,
    listener?: (eventType: string, fileName: string | Buffer | null) => void
  ) => {
    const resolvedListener =
      typeof options === 'function'
        ? options
        : listener

    if (!resolvedListener) {
      throw new Error('Expected fs.watch listener in test mock')
    }

    const watcher = {
      close: vi.fn(),
    }

    watchRegistrations.push({
      directory: String(directory),
      listener: resolvedListener,
      watcher,
    })

    return watcher
  }
)

const spawnMock = vi.fn(
  (command: string, args: string[], options?: Record<string, unknown>) => {
    if (args[1] === 'typegen') {
      const cwd =
        typeof options?.['cwd'] === 'string' ? options['cwd'] : undefined
      if (cwd) {
        mkdirSync(join(cwd, '.next', 'types'), { recursive: true })
        writeFileSync(
          join(cwd, '.next', 'types', 'routes.d.ts'),
          'declare global { interface PageProps<T> {} type LayoutProps<T> = { children?: unknown } }\nexport {}\n',
          'utf8'
        )
      }
    }

    const child = new EventEmitter() as EventEmitter & {
      pid: number
      kill: ReturnType<typeof vi.fn>
      stderr: EventEmitter
    }

    child.pid = 1234
    child.kill = vi.fn()
    child.stderr = new EventEmitter()

    setTimeout(() => {
      child.emit('close', 0)
    }, 0)

    return child
  }
)

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

const serverCleanupMock = vi.fn()
const getPortMock = vi.fn(async () => 4321)
const getIdMock = vi.fn(() => 'integration-test-server')

const createServerMock = vi.fn(async () => ({
  getPort: getPortMock,
  getId: getIdMock,
  cleanup: serverCleanupMock,
}))

vi.mock('../analysis/server.ts', () => ({
  createServer: createServerMock,
}))

const resolveFrameworkBinFileMock = vi.fn(() => '/fake/framework-bin.ts')

vi.mock('./framework.ts', () => ({
  resolveFrameworkBinFile: resolveFrameworkBinFileMock,
}))

function createResolvedPrewarmHandle() {
  return {
    ready: Promise.resolve(),
    settled: Promise.resolve(),
  }
}

const startPrewarmSafelyMock = vi.fn(() => createResolvedPrewarmHandle())
const runPrewarmSafelyMock = vi.fn(async () => undefined)
const prewarmRenounRpcServerCacheMock = vi.fn(async () => undefined)

vi.mock('./prewarm-runner.ts', () => ({
  BUILD_PREWARM_REQUEST_TIMEOUT_MS: 300000,
  createDefaultPrewarmOptions: (rootPath = process.cwd()) => ({
    analysisOptions: {
      tsConfigFilePath: join(rootPath, 'tsconfig.json'),
    },
  }),
  startPrewarmSafely: startPrewarmSafelyMock,
  runPrewarmSafely: runPrewarmSafelyMock,
}))

vi.mock('./prewarm.ts', () => ({
  prewarmRenounRpcServerCache: prewarmRenounRpcServerCacheMock,
}))

let runAppCommand: (typeof import('./app.ts'))['runAppCommand']
const originalEnvironment = captureProcessEnv([
  PROCESS_ENV_KEYS.renounServerPort,
  PROCESS_ENV_KEYS.renounServerId,
  PROCESS_ENV_KEYS.renounServerHost,
  PROCESS_ENV_KEYS.renounServerRefreshNotificationsEffective,
])

async function waitForAssertion(
  assertion: () => void,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 2_000
  const intervalMs = options.intervalMs ?? 20
  const deadline = Date.now() + timeoutMs

  while (true) {
    try {
      assertion()
      return
    } catch (error) {
      if (Date.now() >= deadline) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }
}

async function waitForOverrideCleanup(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 75))
}

async function assertNoWatchersRecreatedAfterCleanup(): Promise<void> {
  const watcherCountBeforeLateEvents = watchMock.mock.calls.length
  expect(watcherCountBeforeLateEvents).toBeGreaterThan(0)

  const initialRegistrations = watchRegistrations.slice(
    0,
    watcherCountBeforeLateEvents
  )
  for (const registration of initialRegistrations) {
    registration.listener('change', 'posts/hello-from-override.mdx')
  }

  await waitForOverrideCleanup()

  expect(watchMock).toHaveBeenCalledTimes(watcherCountBeforeLateEvents)
  for (const registration of initialRegistrations) {
    expect(registration.watcher.close).toHaveBeenCalledTimes(1)
  }
}

beforeAll(async () => {
  vi.doMock('node:fs', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    return {
      ...actual,
      watch: watchMock,
    }
  })
  ;({ runAppCommand: runAppCommand } = await import('./app.ts'))
})

let originalCwd: string

beforeEach(() => {
  originalCwd = process.cwd()
  vi.clearAllMocks()
  watchRegistrations.length = 0
})

afterEach(() => {
  process.chdir(originalCwd)
  restoreProcessEnv(originalEnvironment)
})

describe('runAppCommand integration', () => {
  test('prepares runtime directory and applies project overrides', async () => {
    const tmpRoot = realpathSync(
      await mkdtemp(join(tmpdir(), 'renoun-app-test-'))
    )
    const projectRoot = join(tmpRoot, 'project')
    await mkdir(projectRoot, { recursive: true })

    const nodeModulesExampleDir = join(
      projectRoot,
      'node_modules',
      '@renoun',
      'blog'
    )
    await mkdir(nodeModulesExampleDir, { recursive: true })
    await cp(BLOG_APP_PATH, nodeModulesExampleDir, { recursive: true })
    await mkdir(join(nodeModulesExampleDir, '.next', 'types'), {
      recursive: true,
    })
    await writeFile(
      join(nodeModulesExampleDir, '.next', 'types', 'routes.d.ts'),
      'declare global { interface PageProps<T> {} }\nexport {}\n'
    )

    const projectPackageJson = {
      name: 'app-integration',
      version: '1.0.0',
      dependencies: {
        '@renoun/blog': 'workspace:*',
      },
      devDependencies: {
        renoun: 'workspace:*',
      },
    }
    await writeFile(
      join(projectRoot, 'package.json'),
      JSON.stringify(projectPackageJson, null, 2)
    )

    const postsDirectory = join(projectRoot, 'posts')
    await mkdir(postsDirectory, { recursive: true })
    await writeFile(
      join(postsDirectory, 'hello-from-override.mdx'),
      '# Hello from override!\n'
    )

    // Create a build output directory that should be ignored for overrides
    const outDirectory = join(projectRoot, 'out')
    await mkdir(outDirectory, { recursive: true })

    const rootOverridePath = join(projectRoot, 'root-config.ts')
    await writeFile(rootOverridePath, 'export const root = true\n')

    createServerMock.mockImplementationOnce(async () => {
      process.env[PROCESS_ENV_KEYS.renounServerHost] = '127.0.0.1'
      process.env[PROCESS_ENV_KEYS.renounServerRefreshNotificationsEffective] =
        '0'

      return {
        getPort: getPortMock,
        getId: getIdMock,
        cleanup: serverCleanupMock,
      }
    })

    let resolveExit!: (code: number) => void
    let exitResolved = false
    const exitPromise = new Promise<number>((resolve) => {
      resolveExit = resolve
    })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      if (!exitResolved) {
        exitResolved = true
        resolveExit(code ?? 0)
      }
      return undefined as never
    }) as unknown as typeof process.exit)

    const originalProcessOn = process.on.bind(process)
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      listener: (...args: unknown[]) => void
    ) => {
      if (
        event === 'uncaughtException' ||
        event === 'unhandledRejection' ||
        event === 'SIGINT' ||
        event === 'SIGTERM'
      ) {
        return process
      }

      return originalProcessOn(
        event as Parameters<typeof originalProcessOn>[0],
        listener as Parameters<typeof originalProcessOn>[1]
      )
    }) as unknown as typeof process.on)

    process.chdir(projectRoot)
    runPrewarmSafelyMock.mockImplementationOnce(async () => {
      expect(process.env[PROCESS_ENV_KEYS.renounServerPort]).toBe('4321')
      expect(process.env[PROCESS_ENV_KEYS.renounServerId]).toBe(
        'integration-test-server'
      )
    })

    try {
      await runAppCommand({ command: 'dev', args: ['--port', '4000'] })
      const exitCode = await exitPromise
      expect(exitCode).toBe(0)
      await waitForOverrideCleanup()
      await assertNoWatchersRecreatedAfterCleanup()

      const runtimeRoot = join(projectRoot, '.renoun', 'app', '-renoun-blog')

      expect(createServerMock).toHaveBeenCalledTimes(1)
      await waitForAssertion(() => {
        expect(runPrewarmSafelyMock).toHaveBeenCalledTimes(1)
      })
      expect(runPrewarmSafelyMock).toHaveBeenCalledWith(
        {
          analysisOptions: {
            tsConfigFilePath: join(runtimeRoot, 'tsconfig.json'),
          },
        },
        {
          allowInlineFallback: false,
        }
      )
      expect(getPortMock).toHaveBeenCalled()
      expect(getIdMock).toHaveBeenCalled()
      expect(serverCleanupMock).toHaveBeenCalledTimes(1)

      expect(resolveFrameworkBinFileMock).toHaveBeenCalledWith('next', {
        fromDirectory: runtimeRoot,
      })

      expect(spawnMock).toHaveBeenCalledTimes(1)
      const [command, spawnArgs, spawnOptions] = spawnMock.mock.calls[0]
      expect(command).toBe(process.execPath)
      expect(spawnArgs).toEqual([
        '/fake/framework-bin.ts',
        'dev',
        '--port',
        '4000',
      ])

      expect(spawnOptions?.cwd).toBe(runtimeRoot)
      expect(spawnOptions?.env).toMatchObject({
        RENOUN_RUNTIME_DIRECTORY: runtimeRoot,
        [PROCESS_ENV_KEYS.renounServerPort]: '4321',
        [PROCESS_ENV_KEYS.renounServerId]: 'integration-test-server',
        [PROCESS_ENV_KEYS.renounServerHost]: '127.0.0.1',
        [PROCESS_ENV_KEYS.renounServerRefreshNotificationsEffective]: '0',
      })

      const runtimePackageJson = JSON.parse(
        await readFile(join(runtimeRoot, 'package.json'), 'utf-8')
      )
      expect(runtimePackageJson.name).toBe('@renoun/blog')

      // With additive overrides, the posts directory is a real directory
      // (not a symlink) with individual files hard-linked inside
      const runtimePostsStat = await lstat(join(runtimeRoot, 'posts'))
      expect(runtimePostsStat.isDirectory()).toBe(true)
      expect(runtimePostsStat.isSymbolicLink()).toBe(false)

      // The overridden file inside posts should be a hard link (same inode)
      const overriddenPostPath = join(
        runtimeRoot,
        'posts',
        'hello-from-override.mdx'
      )
      const projectPostPath = join(
        projectRoot,
        'posts',
        'hello-from-override.mdx'
      )
      const runtimeOverriddenPostStat = await stat(overriddenPostPath)
      const projectOverriddenPostStat = await stat(projectPostPath)
      expect(runtimeOverriddenPostStat.ino).toBe(projectOverriddenPostStat.ino)

      // Root-level files should also be hard links
      const runtimeRootConfigStat = await stat(
        join(runtimeRoot, 'root-config.ts')
      )
      const projectRootConfigStat = await stat(rootOverridePath)
      expect(runtimeRootConfigStat.ino).toBe(projectRootConfigStat.ino)

      // Build output directory should not be applied as override
      await expect(lstat(join(runtimeRoot, 'out'))).rejects.toMatchObject({
        code: 'ENOENT',
      })

      const childProcess = spawnMock.mock.results[0]?.value as EventEmitter & {
        kill: ReturnType<typeof vi.fn>
      }
      expect(childProcess.kill).toHaveBeenCalledWith('SIGTERM')
    } finally {
      exitSpy.mockRestore()
      processOnSpy.mockRestore()
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  test('ignores project symlinks that escape the project root', async () => {
    const tmpRoot = realpathSync(
      await mkdtemp(join(tmpdir(), 'renoun-app-symlink-test-'))
    )
    const projectRoot = join(tmpRoot, 'project')
    await mkdir(projectRoot, { recursive: true })

    const nodeModulesExampleDir = join(
      projectRoot,
      'node_modules',
      '@renoun',
      'blog'
    )
    await mkdir(nodeModulesExampleDir, { recursive: true })
    await cp(BLOG_APP_PATH, nodeModulesExampleDir, { recursive: true })
    await mkdir(join(nodeModulesExampleDir, '.next', 'types'), {
      recursive: true,
    })
    await writeFile(
      join(nodeModulesExampleDir, '.next', 'types', 'routes.d.ts'),
      'declare global { interface PageProps<T> {} }\nexport {}\n'
    )

    await writeFile(
      join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'app-integration',
          version: '1.0.0',
          dependencies: { '@renoun/blog': 'workspace:*' },
          devDependencies: { renoun: 'workspace:*' },
        },
        null,
        2
      )
    )

    const outsideFile = join(tmpRoot, 'outside-secret.txt')
    await writeFile(outsideFile, 'do-not-copy')
    const escapeLink = join(projectRoot, 'escape-link.txt')
    await writeFile(escapeLink, '')
    await rm(escapeLink)
    await symlink(outsideFile, escapeLink)

    let resolveExit!: (code: number) => void
    let exitResolved = false
    const exitPromise = new Promise<number>((resolve) => {
      resolveExit = resolve
    })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      if (!exitResolved) {
        exitResolved = true
        resolveExit(code ?? 0)
      }
      return undefined as never
    }) as unknown as typeof process.exit)

    const originalProcessOn = process.on.bind(process)
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      listener: (...args: unknown[]) => void
    ) => {
      if (
        event === 'uncaughtException' ||
        event === 'unhandledRejection' ||
        event === 'SIGINT' ||
        event === 'SIGTERM'
      ) {
        return process
      }

      return originalProcessOn(
        event as Parameters<typeof originalProcessOn>[0],
        listener as Parameters<typeof originalProcessOn>[1]
      )
    }) as unknown as typeof process.on)

    process.chdir(projectRoot)
    runPrewarmSafelyMock.mockImplementationOnce(() => new Promise(() => {}))

    try {
      await runAppCommand({ command: 'dev', args: [] })
      const exitCode = await exitPromise
      expect(exitCode).toBe(0)
      await waitForOverrideCleanup()
      await assertNoWatchersRecreatedAfterCleanup()

      const runtimeRoot = join(projectRoot, '.renoun', 'app', '-renoun-blog')
      await expect(
        lstat(join(runtimeRoot, 'escape-link.txt'))
      ).rejects.toMatchObject({
        code: 'ENOENT',
      })
    } finally {
      exitSpy.mockRestore()
      processOnSpy.mockRestore()
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  test('runs next typegen before prewarming build analysis when route types are missing', async () => {
    const tmpRoot = realpathSync(
      await mkdtemp(join(tmpdir(), 'renoun-app-build-test-'))
    )
    const projectRoot = join(tmpRoot, 'project')
    await mkdir(projectRoot, { recursive: true })

    const nodeModulesExampleDir = join(
      projectRoot,
      'node_modules',
      '@renoun',
      'blog'
    )
    await mkdir(nodeModulesExampleDir, { recursive: true })
    await cp(BLOG_APP_PATH, nodeModulesExampleDir, { recursive: true })

    await writeFile(
      join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'app-integration',
          version: '1.0.0',
          dependencies: { '@renoun/blog': 'workspace:*' },
          devDependencies: { renoun: 'workspace:*' },
        },
        null,
        2
      )
    )

    let resolveExit!: (code: number) => void
    let exitResolved = false
    const exitPromise = new Promise<number>((resolve) => {
      resolveExit = resolve
    })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      if (!exitResolved) {
        exitResolved = true
        resolveExit(code ?? 0)
      }
      return undefined as never
    }) as unknown as typeof process.exit)

    const originalProcessOn = process.on.bind(process)
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      listener: (...args: unknown[]) => void
    ) => {
      if (
        event === 'uncaughtException' ||
        event === 'unhandledRejection' ||
        event === 'SIGINT' ||
        event === 'SIGTERM'
      ) {
        return process
      }

      return originalProcessOn(
        event as Parameters<typeof originalProcessOn>[0],
        listener as Parameters<typeof originalProcessOn>[1]
      )
    }) as unknown as typeof process.on)

    process.chdir(projectRoot)
    startPrewarmSafelyMock.mockImplementationOnce(() => ({
      ready: Promise.resolve().then(() => {
        expect(process.env[PROCESS_ENV_KEYS.renounServerPort]).toBe('4321')
        expect(process.env[PROCESS_ENV_KEYS.renounServerId]).toBe(
          'integration-test-server'
        )
        expect(process.env[PROCESS_ENV_KEYS.renounServerClientRpcCache]).toBe(
          '1'
        )
        expect(
          process.env[PROCESS_ENV_KEYS.renounServerClientRpcCacheTtlMs]
        ).toBe(String(DEFAULT_BUILD_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS))
      }),
      settled: Promise.resolve(),
    }))

    try {
      await runAppCommand({ command: 'build', args: [] })
      const exitCode = await exitPromise
      expect(exitCode).toBe(0)

      const runtimeRoot = join(projectRoot, '.renoun', 'app', '-renoun-blog')
      const runtimeTsConfig = JSON.parse(
        await readFile(join(runtimeRoot, 'tsconfig.json'), 'utf8')
      ) as {
        compilerOptions?: {
          rootDir?: string
          paths?: Record<string, string[]>
        }
      }

      expect(startPrewarmSafelyMock).toHaveBeenCalledTimes(1)
      expect(startPrewarmSafelyMock).toHaveBeenCalledWith(
        {
          analysisOptions: {
            tsConfigFilePath: join(runtimeRoot, 'tsconfig.json'),
          },
        },
        {
          allowInlineFallback: true,
          requestPriority: 'bootstrap',
          timeoutMs: 300000,
        }
      )
      expect(prewarmRenounRpcServerCacheMock).not.toHaveBeenCalled()
      expect(spawnMock).toHaveBeenCalledTimes(2)
      expect(spawnMock.mock.calls[0]?.[1]).toEqual([
        '/fake/framework-bin.ts',
        'typegen',
      ])
      expect(spawnMock.mock.calls[1]?.[1]).toEqual([
        '/fake/framework-bin.ts',
        'build',
      ])
      const [, , spawnOptions] = spawnMock.mock.calls[1]
      expect(spawnOptions?.env).toMatchObject({
        RENOUN_RUNTIME_DIRECTORY: runtimeRoot,
        [PROCESS_ENV_KEYS.renounServerClientRpcCache]: '1',
        [PROCESS_ENV_KEYS.renounServerClientRpcCacheTtlMs]: String(
          DEFAULT_BUILD_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS
        ),
      })
      expect(runtimeTsConfig.compilerOptions?.rootDir).toBeUndefined()
      expect(runtimeTsConfig.compilerOptions?.paths?.['@/*']).toEqual(['./*'])
    } finally {
      exitSpy.mockRestore()
      processOnSpy.mockRestore()
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  test('continues with build prewarm when Next.js route type config is missing', async () => {
    const tmpRoot = realpathSync(
      await mkdtemp(join(tmpdir(), 'renoun-app-build-skip-test-'))
    )
    const projectRoot = join(tmpRoot, 'project')
    await mkdir(projectRoot, { recursive: true })

    const nodeModulesExampleDir = join(
      projectRoot,
      'node_modules',
      '@renoun',
      'blog'
    )
    await mkdir(nodeModulesExampleDir, { recursive: true })
    await cp(BLOG_APP_PATH, nodeModulesExampleDir, { recursive: true })
    await writeFile(
      join(nodeModulesExampleDir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            module: 'ESNext',
            moduleResolution: 'Bundler',
            target: 'ESNext',
          },
          include: ['app/**/*.tsx'],
        },
        null,
        2
      )
    )

    await writeFile(
      join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'app-integration',
          version: '1.0.0',
          dependencies: { '@renoun/blog': 'workspace:*' },
          devDependencies: { renoun: 'workspace:*' },
        },
        null,
        2
      )
    )

    let resolveExit!: (code: number) => void
    let exitResolved = false
    const exitPromise = new Promise<number>((resolve) => {
      resolveExit = resolve
    })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      if (!exitResolved) {
        exitResolved = true
        resolveExit(code ?? 0)
      }
      return undefined as never
    }) as unknown as typeof process.exit)

    const originalProcessOn = process.on.bind(process)
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      listener: (...args: unknown[]) => void
    ) => {
      if (
        event === 'uncaughtException' ||
        event === 'unhandledRejection' ||
        event === 'SIGINT' ||
        event === 'SIGTERM'
      ) {
        return process
      }

      return originalProcessOn(
        event as Parameters<typeof originalProcessOn>[0],
        listener as Parameters<typeof originalProcessOn>[1]
      )
    }) as unknown as typeof process.on)

    process.chdir(projectRoot)

    try {
      await runAppCommand({ command: 'build', args: [] })
      const exitCode = await exitPromise
      expect(exitCode).toBe(0)

      expect(startPrewarmSafelyMock).toHaveBeenCalledTimes(1)
      expect(startPrewarmSafelyMock).toHaveBeenCalledWith(
        {
          analysisOptions: {
            tsConfigFilePath: join(
              projectRoot,
              '.renoun',
              'app',
              '-renoun-blog',
              'tsconfig.json'
            ),
          },
        },
        {
          allowInlineFallback: true,
          requestPriority: 'bootstrap',
          timeoutMs: 300000,
        }
      )
      expect(prewarmRenounRpcServerCacheMock).not.toHaveBeenCalled()
      expect(spawnMock).toHaveBeenCalledTimes(1)
      expect(spawnMock.mock.calls[0]?.[1]).toEqual([
        '/fake/framework-bin.ts',
        'build',
      ])
    } finally {
      exitSpy.mockRestore()
      processOnSpy.mockRestore()
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })
})
