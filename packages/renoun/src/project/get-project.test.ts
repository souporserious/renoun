import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const watcherState = vi.hoisted(() => {
  return {
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
    invalidateProjectFileCachePaths: vi.fn(),
    invalidateRuntimeAnalysisCachePaths: vi.fn(),
  }
})

vi.mock('./cache.ts', async () => {
  const actual = await vi.importActual<typeof import('./cache.ts')>(
    './cache.ts'
  )

  return {
    ...actual,
    invalidateProjectFileCachePaths:
      mockedInvalidationFns.invalidateProjectFileCachePaths,
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
        watcherState.callback = callback
        return {
          close: vi.fn(),
        }
      }
    ),
  }
})

import { disposeProjectWatchers, getProject } from './get-project.ts'

describe('project watcher invalidation batching', () => {
  const previousServerPort = process.env['RENOUN_SERVER_PORT']
  const previousWatcherOverride = process.env['RENOUN_PROJECT_WATCHERS']

  beforeEach(() => {
    process.env['RENOUN_SERVER_PORT'] = '3000'
    process.env['RENOUN_PROJECT_WATCHERS'] = 'true'
    mockedInvalidationFns.invalidateProjectFileCachePaths.mockClear()
    mockedInvalidationFns.invalidateRuntimeAnalysisCachePaths.mockClear()
    watcherState.callback = undefined
  })

  afterEach(() => {
    disposeProjectWatchers()

    if (previousServerPort === undefined) {
      delete process.env['RENOUN_SERVER_PORT']
    } else {
      process.env['RENOUN_SERVER_PORT'] = previousServerPort
    }

    if (previousWatcherOverride === undefined) {
      delete process.env['RENOUN_PROJECT_WATCHERS']
    } else {
      process.env['RENOUN_PROJECT_WATCHERS'] = previousWatcherOverride
    }
  })

  test('coalesces watcher storms into a single flush batch', async () => {
    const uniqueId = Date.now()
    const projectDirectory = `/virtual-project-${uniqueId}`

    getProject({
      useInMemoryFileSystem: true,
      projectId: `watcher-storm-${uniqueId}`,
      tsConfigFilePath: `${projectDirectory}/tsconfig.json`,
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
      mockedInvalidationFns.invalidateProjectFileCachePaths
    ).toHaveBeenCalledTimes(1)

    const [runtimePaths] =
      mockedInvalidationFns.invalidateRuntimeAnalysisCachePaths.mock.calls[0] ??
      []
    expect(runtimePaths).toEqual([`${projectDirectory}/src`])

    const [, projectPaths] =
      mockedInvalidationFns.invalidateProjectFileCachePaths.mock.calls[0] ?? []
    expect(projectPaths).toEqual([`${projectDirectory}/src`])
  })
})
