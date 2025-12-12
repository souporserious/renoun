import { EventEmitter } from 'node:events'
import { realpathSync } from 'node:fs'
import {
  cp,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
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

const BLOG_EXAMPLE_PATH = fileURLToPath(
  new URL('../../../../examples/blog', import.meta.url)
)

const spawnMock = vi.fn(
  (command: string, args: string[], options?: Record<string, unknown>) => {
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

vi.mock('../project/server.js', () => ({
  createServer: createServerMock,
}))

const resolveFrameworkBinFileMock = vi.fn(() => '/fake/framework-bin.js')

vi.mock('./framework.js', () => ({
  resolveFrameworkBinFile: resolveFrameworkBinFileMock,
}))

let runAppCommand: (typeof import('./app.js'))['runAppCommand']

beforeAll(async () => {
  ;({ runAppCommand: runAppCommand } = await import('./app.js'))
})

let originalCwd: string

beforeEach(() => {
  originalCwd = process.cwd()
  vi.clearAllMocks()
})

afterEach(() => {
  process.chdir(originalCwd)
})

describe('runAppCommand integration', () => {
  test('prepares runtime directory and shadows project overrides', async () => {
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
    await cp(BLOG_EXAMPLE_PATH, nodeModulesExampleDir, { recursive: true })

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
      join(postsDirectory, 'hello-from-shadow.mdx'),
      '# Hello from shadow!\n'
    )

    const rootOverridePath = join(projectRoot, 'root-config.ts')
    await writeFile(rootOverridePath, 'export const root = true\n')

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
      await runAppCommand({ command: 'dev', args: ['--port', '4000'] })
      const exitCode = await exitPromise
      expect(exitCode).toBe(0)

      expect(createServerMock).toHaveBeenCalledTimes(1)
      expect(getPortMock).toHaveBeenCalled()
      expect(getIdMock).toHaveBeenCalled()
      expect(serverCleanupMock).toHaveBeenCalledTimes(1)

      expect(resolveFrameworkBinFileMock).toHaveBeenCalledWith('next')

      expect(spawnMock).toHaveBeenCalledTimes(1)
      const [command, spawnArgs, spawnOptions] = spawnMock.mock.calls[0]
      expect(command).toBe(process.execPath)
      expect(spawnArgs).toEqual([
        '/fake/framework-bin.js',
        'dev',
        '--port',
        '4000',
      ])

      const runtimeRoot = join(projectRoot, '.renoun', 'app', '-renoun-blog')

      expect(spawnOptions?.cwd).toBe(runtimeRoot)
      expect(spawnOptions?.env).toMatchObject({
        RENOUN_RUNTIME_DIRECTORY: runtimeRoot,
      })

      const runtimePackageJson = JSON.parse(
        await readFile(join(runtimeRoot, 'package.json'), 'utf-8')
      )
      expect(runtimePackageJson.name).toBe('@renoun/blog')

      const runtimePostsStat = await lstat(join(runtimeRoot, 'posts'))
      expect(runtimePostsStat.isSymbolicLink()).toBe(true)
      const runtimePostsLink = await readlink(join(runtimeRoot, 'posts'))
      expect(resolvePath(runtimeRoot, runtimePostsLink)).toBe(
        join(projectRoot, 'posts')
      )

      const runtimeRootConfigStat = await lstat(
        join(runtimeRoot, 'root-config.ts')
      )
      expect(runtimeRootConfigStat.isSymbolicLink()).toBe(true)
      const runtimeRootConfigLink = await readlink(
        join(runtimeRoot, 'root-config.ts')
      )
      expect(resolvePath(runtimeRoot, runtimeRootConfigLink)).toBe(
        rootOverridePath
      )

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
})
