import { describe, expect, test } from 'vitest'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_FILTER,
  createBuildEnvironment,
  resolveBuildInvocation,
  resolveCleanPathForRemoval,
  resolveDefaultCleanPaths,
} from './bench-site-build.mjs'

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url))

describe('bench site build invocation', () => {
  test('runs the default site benchmark through the turbo-backed root build entrypoint', () => {
    expect(
      resolveBuildInvocation({
        projectRoot: '/workspace/renoun',
        filter: DEFAULT_FILTER,
        platform: 'darwin',
      })
    ).toEqual({
      command: 'pnpm',
      args: ['build', '--filter=@apps/site'],
    })
  })

  test('keeps pnpm filter mode for non-site benchmark targets', () => {
    expect(
      resolveBuildInvocation({
        projectRoot: '/workspace/renoun',
        filter: '@examples/docs',
        platform: 'linux',
      })
    ).toEqual({
      command: 'pnpm',
      args: ['--filter', '@examples/docs', 'build'],
    })
  })

  test('uses the Windows pnpm shim when spawning benchmark builds', () => {
    expect(
      resolveBuildInvocation({
        projectRoot: 'C:\\workspace\\renoun',
        filter: DEFAULT_FILTER,
        platform: 'win32',
      })
    ).toEqual({
      command: 'pnpm.cmd',
      args: ['build', '--filter=@apps/site'],
    })
  })

  test('rejects Windows clean paths on another drive', () => {
    expect(() =>
      resolveCleanPathForRemoval({
        projectRoot: 'C:\\workspace\\renoun',
        cleanPath: 'D:\\benchmark-cache',
        platform: 'win32',
      })
    ).toThrow(
      'Refusing to remove clean path outside workspace: D:\\benchmark-cache -> D:\\benchmark-cache'
    )
  })

  test('cleans the default site benchmark outputs before cold runs', async () => {
    await expect(
      resolveDefaultCleanPaths({
        projectRoot: PROJECT_ROOT,
        filter: DEFAULT_FILTER,
      })
    ).resolves.toEqual([
      '.turbo',
      '.renoun/cache/fs-cache.sqlite',
      '.renoun/cache/fs-cache.sqlite-shm',
      '.renoun/cache/fs-cache.sqlite-wal',
      '.renoun/cache/fs-cache.sqlite-journal',
      'apps/site/.next',
      'apps/site/out',
      'apps/site/.renoun/cache/fs-cache.sqlite',
      'apps/site/.renoun/cache/fs-cache.sqlite-shm',
      'apps/site/.renoun/cache/fs-cache.sqlite-wal',
      'apps/site/.renoun/cache/fs-cache.sqlite-journal',
    ])
  })

  test('requires explicit clean paths for non-default benchmark targets', async () => {
    await expect(
      resolveDefaultCleanPaths({
        projectRoot: PROJECT_ROOT,
        filter: '@examples/docs',
      })
    ).rejects.toThrow(
      'Default clean paths are only defined for "@apps/site". Pass one or more --clean-path values for "@examples/docs".'
    )
  })

  test('forces benchmark subprocesses to use local-only Turbo cache state', () => {
    const env = createBuildEnvironment({
      cacheStats: false,
      parentEnv: {
        PATH: '/usr/bin',
        TURBO_API: 'https://cache.example.com',
        TURBO_CACHE: 'local:r,remote:rw',
        TURBO_CACHE_DIR: '/tmp/custom-turbo-cache',
        TURBO_LOGIN: 'https://cache.example.com/login',
        TURBO_PREFLIGHT: '1',
        TURBO_REMOTE_CACHE_READ_ONLY: '1',
        TURBO_REMOTE_CACHE_SIGNATURE_KEY: 'secret',
        TURBO_REMOTE_CACHE_TIMEOUT: '60',
        TURBO_REMOTE_CACHE_UPLOAD_TIMEOUT: '120',
        TURBO_REMOTE_ONLY: '1',
        TURBO_TEAM: 'acme',
        TURBO_TEAMID: 'team_123',
        TURBO_TOKEN: 'token',
      },
    })

    expect(env).toMatchObject({
      PATH: '/usr/bin',
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      RENOUN_DEBUG: '0',
      TURBO_CACHE: 'local:rw',
    })
    expect(env.TURBO_API).toBeUndefined()
    expect(env.TURBO_CACHE_DIR).toBeUndefined()
    expect(env.TURBO_LOGIN).toBeUndefined()
    expect(env.TURBO_PREFLIGHT).toBeUndefined()
    expect(env.TURBO_REMOTE_CACHE_READ_ONLY).toBeUndefined()
    expect(env.TURBO_REMOTE_CACHE_SIGNATURE_KEY).toBeUndefined()
    expect(env.TURBO_REMOTE_CACHE_TIMEOUT).toBeUndefined()
    expect(env.TURBO_REMOTE_CACHE_UPLOAD_TIMEOUT).toBeUndefined()
    expect(env.TURBO_REMOTE_ONLY).toBeUndefined()
    expect(env.TURBO_TEAM).toBeUndefined()
    expect(env.TURBO_TEAMID).toBeUndefined()
    expect(env.TURBO_TOKEN).toBeUndefined()
  })
})
