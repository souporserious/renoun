import { describe, expect, test } from 'vitest'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_FILTER,
  resolveBuildInvocation,
  resolveDefaultCleanPaths,
} from './bench-site-build.mjs'

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url))

describe('bench site build invocation', () => {
  test('runs the default site benchmark through the package-local build entrypoint', () => {
    expect(
      resolveBuildInvocation({
        projectRoot: '/workspace/renoun',
        filter: DEFAULT_FILTER,
      })
    ).toEqual({
      command: 'pnpm',
      args: ['--dir', '/workspace/renoun/apps/site', 'build'],
    })
  })

  test('keeps pnpm filter mode for non-site benchmark targets', () => {
    expect(
      resolveBuildInvocation({
        projectRoot: '/workspace/renoun',
        filter: '@examples/docs',
      })
    ).toEqual({
      command: 'pnpm',
      args: ['--filter', '@examples/docs', 'build'],
    })
  })

  test('cleans the default site benchmark outputs before cold runs', async () => {
    await expect(
      resolveDefaultCleanPaths({
        projectRoot: PROJECT_ROOT,
        filter: DEFAULT_FILTER,
      })
    ).resolves.toEqual([
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
})
