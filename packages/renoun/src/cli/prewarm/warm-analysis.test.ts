import { afterEach, describe, expect, test } from 'vitest'

import { partitionWarmMethods } from './warm-analysis.ts'

describe('partitionWarmMethods', () => {
  afterEach(() => {
    delete process.env.RENOUN_SERVER_PORT
    delete process.env.RENOUN_SERVER_ID
    delete process.env.NODE_ENV
  })

  test('keeps reference base in bootstrap while deferring deeper metadata for production server-backed JavaScript targets', () => {
    process.env.RENOUN_SERVER_PORT = '1234'
    process.env.RENOUN_SERVER_ID = 'test-server-id'
    process.env.NODE_ENV = 'production'

    const { bootstrapMethods, backgroundMethods } = partitionWarmMethods(
      new Set([
        'getExports',
        'getReferenceBase',
        'getExportTypes',
        'getGitMetadata',
        'getSections',
      ]),
      {
        extension: 'tsx',
        leafOnly: false,
        fileCount: 2,
      }
    )

    expect([...bootstrapMethods].sort()).toEqual([
      'getExports',
      'getReferenceBase',
    ])
    expect([...backgroundMethods].sort()).toEqual([
      'getExportTypes',
      'getGitMetadata',
      'getSections',
    ])
  })
})
