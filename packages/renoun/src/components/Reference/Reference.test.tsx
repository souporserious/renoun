import React from 'react'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { Cache } from '../../file-system/Cache.ts'
import { GitFileSystem } from '../../file-system/GitFileSystem.ts'
import { Repository } from '../../file-system/Repository.ts'
import { ModuleExport } from '../../file-system/entries.ts'
import { Reference } from './Reference.tsx'

const temporaryDirectories: string[] = []

const GIT_ENV = {
  LC_ALL: 'C',
  GIT_AUTHOR_NAME: 'Test User',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test User',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_ASKPASS: 'echo',
  SSH_ASKPASS: 'echo',
} as const

function git(cwd: string, args: string[]) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      ...GIT_ENV,
    },
  })

  if (result.status !== 0) {
    throw new Error(`Git error: ${result.stderr} (cmd: git ${args.join(' ')})`)
  }

  return result.stdout.trim()
}

function createProjectFixture(options?: {
  sourceText?: string
  tsconfig?: Record<string, unknown>
}) {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'renoun-reference-'))
  temporaryDirectories.push(workspaceRoot)

  mkdirSync(join(workspaceRoot, 'src'), { recursive: true })
  writeFileSync(
    join(workspaceRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions:
        options?.tsconfig?.['compilerOptions'] ?? {
          allowJs: true,
          checkJs: true,
        },
      include: ['src/**/*.ts'],
      ...options?.tsconfig,
    })
  )
  writeFileSync(
    join(workspaceRoot, 'src', 'index.ts'),
    options?.sourceText ?? 'export const value = 1\n'
  )

  git(workspaceRoot, ['-c', 'init.defaultBranch=main', 'init'])
  git(workspaceRoot, ['add', 'tsconfig.json', 'src/index.ts'])
  git(workspaceRoot, ['commit', '--no-gpg-sign', '-m', 'init'])

  return workspaceRoot
}

function closeRepository(repository: Repository) {
  const fileSystem = repository.getFileSystem()
  if (fileSystem instanceof GitFileSystem) {
    fileSystem.close()
  }
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) {
      rmSync(directory, { recursive: true, force: true })
    }
  }
})

describe('Reference', () => {
  test('uses repository context for string sources', async () => {
    const workspaceRoot = createProjectFixture()
    const repository = Repository.resolveUnsafe({
      path: workspaceRoot,
      cache: new Cache({
        outputDirectory: join(workspaceRoot, '.cache'),
      }),
    })!

    try {
      const fileSystem = repository.getFileSystem()
      const relativePathSpy = vi.spyOn(fileSystem, 'getRelativePathToWorkspace')

      const element = await Reference({
        source: join(workspaceRoot, 'src', 'index.ts'),
        repository,
      })
      const markup = renderToStaticMarkup(<>{element}</>)

      expect(markup).toContain('value')
      expect(relativePathSpy).toHaveBeenCalledWith(
        join(workspaceRoot, 'src', 'index.ts')
      )
    } finally {
      closeRepository(repository)
    }
  })

  test('uses file system context for string sources', async () => {
    const workspaceRoot = createProjectFixture()
    const repository = Repository.resolveUnsafe({
      path: workspaceRoot,
      cache: new Cache({
        outputDirectory: join(workspaceRoot, '.cache'),
      }),
    })!

    try {
      const fileSystem = repository.getFileSystem()
      const relativePathSpy = vi.spyOn(fileSystem, 'getRelativePathToWorkspace')

      const element = await Reference({
        source: join(workspaceRoot, 'src', 'index.ts'),
        fileSystem,
      })
      const markup = renderToStaticMarkup(<>{element}</>)

      expect(markup).toContain('value')
      expect(relativePathSpy).toHaveBeenCalledWith(
        join(workspaceRoot, 'src', 'index.ts')
      )
    } finally {
      closeRepository(repository)
    }
  })

  test('renders classes without explicit constructor metadata', async () => {
    const workspaceRoot = createProjectFixture({
      sourceText: 'export class LightingModel { intensity = 1 }\n',
    })
    const repository = Repository.resolveUnsafe({
      path: workspaceRoot,
      cache: new Cache({
        outputDirectory: join(workspaceRoot, '.cache'),
      }),
    })!

    try {
      const element = await Reference({
        source: join(workspaceRoot, 'src', 'index.ts'),
        repository,
      })
      const markup = renderToStaticMarkup(<>{element}</>)

      expect(markup).toContain('LightingModel')
      expect(markup).not.toContain('Constructor')
    } finally {
      closeRepository(repository)
    }
  })

  test('uses batched file export type resolution and preserves stripInternal filtering', async () => {
    const workspaceRoot = createProjectFixture({
      sourceText: [
        '/** Visible export. */',
        'export const visible = 1',
        '',
        '/** @internal */',
        'export const hidden = 2',
        '',
      ].join('\n'),
      tsconfig: {
        compilerOptions: {
          allowJs: true,
          checkJs: true,
          stripInternal: true,
        },
      },
    })
    const repository = Repository.resolveUnsafe({
      path: workspaceRoot,
      cache: new Cache({
        outputDirectory: join(workspaceRoot, '.cache'),
      }),
    })!

    try {
      const getTypeSpy = vi.spyOn(ModuleExport.prototype, 'getType')
      try {
        const element = await Reference({
          source: join(workspaceRoot, 'src', 'index.ts'),
          repository,
        })
        const markup = renderToStaticMarkup(<>{element}</>)

        expect(markup).toContain('visible')
        expect(markup).not.toContain('hidden')
        expect(getTypeSpy).not.toHaveBeenCalled()
      } finally {
        getTypeSpy.mockRestore()
      }
    } finally {
      closeRepository(repository)
    }
  })

  test('renders all exports for very large modules with batched type resolution', async () => {
    const workspaceRoot = createProjectFixture({
      sourceText: Array.from({ length: 121 }, (_, index) => {
        return `export const export${index} = ${index}`
      }).join('\n'),
    })
    const repository = Repository.resolveUnsafe({
      path: workspaceRoot,
      cache: new Cache({
        outputDirectory: join(workspaceRoot, '.cache'),
      }),
    })!

    try {
      const getTypeSpy = vi.spyOn(ModuleExport.prototype, 'getType')

      try {
        const element = await Reference({
          source: join(workspaceRoot, 'src', 'index.ts'),
          repository,
        })
        const markup = renderToStaticMarkup(<>{element}</>)

        expect(markup).toContain('export0')
        expect(markup).toContain('export120')
        expect(getTypeSpy).not.toHaveBeenCalled()
      } finally {
        getTypeSpy.mockRestore()
      }
    } finally {
      closeRepository(repository)
    }
  })
})
