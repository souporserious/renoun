import { describe, expect, test } from 'vitest'

import {
  DEFAULT_FILTER,
  resolveBuildInvocation,
} from './bench-site-build.mjs'

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
})
