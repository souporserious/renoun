import { describe, expect, test, vi } from 'vitest'

vi.mock('../analysis/client.ts', () => ({
  getSourceTextMetadata: vi.fn(async () => ({ kind: 'metadata' })),
  getTokens: vi.fn(async () => [{ tokens: [] }]),
}))

import * as analysisClient from '../analysis/client.ts'

import {
  getProjectOptionsCacheKey,
  getSourceTextMetadata,
  getTokens,
} from './client.ts'

describe('project client compatibility', () => {
  test('maps projectOptions to analysisOptions for source metadata', async () => {
    await getSourceTextMetadata({
      filePath: '/workspace/example.ts',
      projectOptions: {
        projectId: 'docs',
        tsConfigFilePath: '/workspace/tsconfig.json',
        useInMemoryFileSystem: true,
      },
    } as never)

    expect(analysisClient.getSourceTextMetadata).toHaveBeenCalledWith({
      filePath: '/workspace/example.ts',
      analysisOptions: {
        analysisScopeId: 'docs',
        tsConfigFilePath: '/workspace/tsconfig.json',
        useInMemoryFileSystem: true,
      },
    })
  })

  test('maps projectOptions to analysisOptions for tokenization', async () => {
    await getTokens({
      value: 'const answer = 42',
      language: 'ts',
      projectOptions: {
        projectId: 'docs',
      },
    } as never)

    expect(analysisClient.getTokens).toHaveBeenCalledWith({
      value: 'const answer = 42',
      language: 'ts',
      analysisOptions: {
        analysisScopeId: 'docs',
      },
    })
  })

  test('keeps the project cache key format stable', () => {
    expect(
      getProjectOptionsCacheKey({
        theme: 'github-dark',
        siteUrl: 'https://renoun.dev',
        gitSource: 'souporserious/renoun',
        gitBranch: 'main',
        gitHost: 'github',
        projectId: 'docs',
        tsConfigFilePath: '/workspace/tsconfig.json',
        useInMemoryFileSystem: true,
        compilerOptions: {
          strict: true,
        },
      })
    ).toBe(
      't:github-dark;u:https://renoun.dev;s:souporserious/renoun;b:main;h:github;i:docs;f:/workspace/tsconfig.json;m:1;c:strict=true;'
    )
  })
})
