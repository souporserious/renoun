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
      '.renoun',
      'apps/site/.next',
      'apps/site/out',
      'apps/site/.renoun',
    ])
  })

  test('scopes default cold-run cleanup to the selected benchmark target', async () => {
    await expect(
      resolveDefaultCleanPaths({
        projectRoot: PROJECT_ROOT,
        filter: '@examples/docs',
      })
    ).resolves.toEqual([
      '.renoun',
      'examples/docs/.next',
      'examples/docs/out',
      'examples/docs/.renoun',
    ])
  })
})
