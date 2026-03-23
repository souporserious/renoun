import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { captureProcessEnv, restoreProcessEnv } from '../utils/test.ts'

const watcherState = vi.hoisted(() => {
  return {
    throwOnWatch: false,
    callback:
      undefined as
        | ((
            eventType: string,
            fileName: string | Buffer
          ) => void | Promise<void>)
        | undefined,
  }
})

const mockedInvalidationFns = vi.hoisted(() => {
  return {
    invalidateProgramFileCachePaths: vi.fn(),
    invalidateRuntimeAnalysisCachePaths: vi.fn(),
  }
})
const mockedGitIgnoreFns = vi.hoisted(() => {
  return {
    isFilePathGitIgnored: vi.fn(() => false),
  }
})
const mockedBestEffortFns = vi.hoisted(() => {
  return {
    reportBestEffortError: vi.fn(),
  }
})

vi.mock('./cache.ts', async () => {
  const actual = await vi.importActual<typeof import('./cache.ts')>(
    './cache.ts'
  )

  return {
    ...actual,
    invalidateProgramFileCachePaths:
      mockedInvalidationFns.invalidateProgramFileCachePaths,
  }
})

vi.mock('./cached-analysis.ts', async () => {
  const actual = await vi.importActual<typeof import('./cached-analysis.ts')>(
    './cached-analysis.ts'
  )

  return {
    ...actual,
    invalidateRuntimeAnalysisCachePaths:
      mockedInvalidationFns.invalidateRuntimeAnalysisCachePaths,
  }
})

vi.mock('../utils/is-file-path-git-ignored.ts', () => ({
  isFilePathGitIgnored: mockedGitIgnoreFns.isFilePathGitIgnored,
}))

vi.mock('../utils/best-effort.ts', () => ({
  reportBestEffortError: mockedBestEffortFns.reportBestEffortError,
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')

  return {
    ...actual,
    existsSync: vi.fn(() => false),
    statSync: vi.fn(() => ({
      isDirectory: () => false,
    })),
    watch: vi.fn(
      (
        _path: string,
        _options: unknown,
        callback: (
          eventType: string,
          fileName: string | Buffer
        ) => void | Promise<void>
      ) => {
        if (watcherState.throwOnWatch) {
          throw new Error('[renoun] recursive watch unavailable')
        }
        watcherState.callback = callback
        return {
          close: vi.fn(),
        }
      }
    ),
  }
})

import {
  disposeAnalysisWatchers,
  getProgram,
  invalidateProgramCachesByPath,
} from './get-program.ts'

describe('analysis watcher invalidation batching', () => {
  const originalEnvironment = captureProcessEnv([
    'RENOUN_SERVER_PORT',
    'RENOUN_ANALYSIS_WATCHERS',
    'NODE_ENV',
    'VITEST',
    'VITEST_WORKER_ID',
  ])

  beforeEach(() => {
    process.env['RENOUN_SERVER_PORT'] = '3000'
    process.env['RENOUN_ANALYSIS_WATCHERS'] = 'true'
    mockedInvalidationFns.invalidateProgramFileCachePaths.mockClear()
    mockedInvalidationFns.invalidateRuntimeAnalysisCachePaths.mockClear()
    mockedGitIgnoreFns.isFilePathGitIgnored.mockClear()
    mockedBestEffortFns.reportBestEffortError.mockClear()
    watcherState.callback = undefined
    watcherState.throwOnWatch = false
  })

  afterEach(() => {
    disposeAnalysisWatchers()
    restoreProcessEnv(originalEnvironment)
  })

  test('coalesces watcher storms into a single flush batch', async () => {
    const uniqueId = Date.now()
    const workspaceDirectory = `/virtual-project-${uniqueId}`

    getProgram({
      useInMemoryFileSystem: true,
      analysisScopeId: `watcher-storm-${uniqueId}`,
      tsConfigFilePath: `${workspaceDirectory}/tsconfig.json`,
    })

    const callback = watcherState.callback
    expect(typeof callback).toBe('function')

    if (!callback) {
      throw new Error('[renoun] expected watcher callback to be defined')
    }

    for (let index = 0; index < 40; index += 1) {
      await callback('rename', `src/file-${index}.ts`)
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 60)
    })

    expect(
      mockedInvalidationFns.invalidateRuntimeAnalysisCachePaths
    ).toHaveBeenCalledTimes(1)
    expect(
      mockedInvalidationFns.invalidateProgramFileCachePaths
    ).toHaveBeenCalledTimes(1)

    const [runtimePaths] =
      mockedInvalidationFns.invalidateRuntimeAnalysisCachePaths.mock.calls[0] ??
      []
    expect(runtimePaths).toEqual([`${workspaceDirectory}/src`])

    const [, projectPaths] =
      mockedInvalidationFns.invalidateProgramFileCachePaths.mock.calls[0] ?? []
    expect(projectPaths).toEqual([`${workspaceDirectory}/src`])
  })

  test('does not drop watcher invalidations when project root ancestors include ignored segment names', async () => {
    const uniqueId = Date.now()
    const workspaceDirectory = `/virtual-project-roots/build/project-${uniqueId}`

    getProgram({
      useInMemoryFileSystem: true,
      analysisScopeId: `watcher-build-root-${uniqueId}`,
      tsConfigFilePath: `${workspaceDirectory}/tsconfig.json`,
    })

    const callback = watcherState.callback
    expect(typeof callback).toBe('function')

    if (!callback) {
      throw new Error('[renoun] expected watcher callback to be defined')
    }

    await callback('rename', `src/file.ts`)

    await new Promise((resolve) => {
      setTimeout(resolve, 60)
    })

    expect(
      mockedInvalidationFns.invalidateRuntimeAnalysisCachePaths
    ).toHaveBeenCalledTimes(1)
    expect(
      mockedInvalidationFns.invalidateProgramFileCachePaths
    ).toHaveBeenCalledTimes(1)

    const [runtimePaths] =
      mockedInvalidationFns.invalidateRuntimeAnalysisCachePaths.mock.calls[0] ??
      []
    expect(runtimePaths).toEqual([`${workspaceDirectory}/src`])

    const [, projectPaths] =
      mockedInvalidationFns.invalidateProgramFileCachePaths.mock.calls[0] ?? []
    expect(projectPaths).toEqual([`${workspaceDirectory}/src`])
  })

  test('treats dot invalidation as global across tracked programs', () => {
    const uniqueId = Date.now()
    const workspaceDirectory = `/virtual-project-dot-${uniqueId}`
    const project = getProgram({
      useInMemoryFileSystem: true,
      analysisScopeId: `watcher-dot-${uniqueId}`,
      tsConfigFilePath: `${workspaceDirectory}/tsconfig.json`,
    })

    const affectedProjects = invalidateProgramCachesByPath('.')

    expect(affectedProjects).toBeGreaterThan(0)
    expect(
      mockedInvalidationFns.invalidateProgramFileCachePaths
    ).toHaveBeenCalledWith(project, ['.'])
  })

  test('invalidates dependency paths that are outside tracked project directories', () => {
    const uniqueId = Date.now()
    const firstProjectDirectory = `/virtual-project-deps-a-${uniqueId}`
    const secondProjectDirectory = `/virtual-project-deps-b-${uniqueId}`
    const firstProject = getProgram({
      useInMemoryFileSystem: true,
      analysisScopeId: `watcher-deps-a-${uniqueId}`,
      tsConfigFilePath: `${firstProjectDirectory}/tsconfig.json`,
    })
    const secondProject = getProgram({
      useInMemoryFileSystem: true,
      analysisScopeId: `watcher-deps-b-${uniqueId}`,
      tsConfigFilePath: `${secondProjectDirectory}/tsconfig.json`,
    })
    const externalDependencyPath = `/virtual-shared-deps-${uniqueId}/src/shared.ts`

    const affectedProjects = invalidateProgramCachesByPath(externalDependencyPath)

    expect(affectedProjects).toBe(2)
    expect(
      mockedInvalidationFns.invalidateProgramFileCachePaths
    ).toHaveBeenCalledTimes(2)
    expect(
      mockedInvalidationFns.invalidateProgramFileCachePaths
    ).toHaveBeenCalledWith(firstProject, [externalDependencyPath])
    expect(
      mockedInvalidationFns.invalidateProgramFileCachePaths
    ).toHaveBeenCalledWith(secondProject, [externalDependencyPath])
  })

  test('does not enable watchers in vitest worker mode without explicit override', () => {
    delete process.env['RENOUN_ANALYSIS_WATCHERS']
    process.env['NODE_ENV'] = 'development'
    delete process.env['VITEST']
    process.env['VITEST_WORKER_ID'] = '1'

    const uniqueId = Date.now()
    const workspaceDirectory = `/virtual-project-no-watch-${uniqueId}`

    getProgram({
      useInMemoryFileSystem: true,
      analysisScopeId: `watcher-disabled-${uniqueId}`,
      tsConfigFilePath: `${workspaceDirectory}/tsconfig.json`,
    })

    expect(watcherState.callback).toBeUndefined()
  })

  test('degrades gracefully when recursive watch is unavailable', () => {
    watcherState.throwOnWatch = true

    expect(() => {
      getProgram({
        useInMemoryFileSystem: true,
        analysisScopeId: `watcher-unavailable-${Date.now()}`,
        tsConfigFilePath: `/virtual-project-watch-unavailable/tsconfig.json`,
      })
    }).not.toThrow()

    expect(watcherState.callback).toBeUndefined()
    expect(mockedBestEffortFns.reportBestEffortError).toHaveBeenCalledTimes(1)
  })

  test('reports watcher callback failures without throwing', () => {
    const uniqueId = Date.now()
    const workspaceDirectory = `/virtual-project-watch-errors-${uniqueId}`

    getProgram({
      useInMemoryFileSystem: true,
      analysisScopeId: `watcher-errors-${uniqueId}`,
      tsConfigFilePath: `${workspaceDirectory}/tsconfig.json`,
    })

    const callback = watcherState.callback
    expect(typeof callback).toBe('function')

    if (!callback) {
      throw new Error('[renoun] expected watcher callback to be defined')
    }

    mockedGitIgnoreFns.isFilePathGitIgnored.mockImplementationOnce(() => {
      throw new Error('[renoun] git ignore failure')
    })

    expect(() => {
      callback('rename', 'src/file.ts')
    }).not.toThrow()

    expect(mockedBestEffortFns.reportBestEffortError).toHaveBeenCalledTimes(1)
  })
})

describe('getProgram cache key normalization', () => {
  afterEach(() => {
    disposeAnalysisWatchers()
    vi.mocked(existsSync).mockReset()
    vi.mocked(existsSync).mockReturnValue(false)
  })

  test('reuses the same project for implicit and explicit default tsconfig paths', () => {
    const previousCwd = process.cwd()
    const tempDirectory = mkdtempSync(join(tmpdir(), 'renoun-get-program-'))
    const defaultTsConfigFilePath = join(tempDirectory, 'tsconfig.json')

    writeFileSync(
      defaultTsConfigFilePath,
      JSON.stringify({
        compilerOptions: {
          allowJs: true,
          jsx: 'react-jsx',
          module: 'esnext',
          target: 'esnext',
        },
      })
    )

    vi.mocked(existsSync).mockImplementation((path) => {
      return path === 'tsconfig.json' || path === defaultTsConfigFilePath
    })

    process.chdir(tempDirectory)

    try {
      const implicitProject = getProgram()
      const explicitProject = getProgram({
        tsConfigFilePath: defaultTsConfigFilePath,
      })

      expect(explicitProject).toBe(implicitProject)
    } finally {
      process.chdir(previousCwd)
      rmSync(tempDirectory, { recursive: true, force: true })
    }
  })
})
