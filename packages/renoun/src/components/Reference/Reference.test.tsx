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

function createProjectFixture() {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'renoun-reference-'))
  temporaryDirectories.push(workspaceRoot)

  mkdirSync(join(workspaceRoot, 'src'), { recursive: true })
  writeFileSync(
    join(workspaceRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        allowJs: true,
        checkJs: true,
      },
      include: ['src/**/*.ts'],
    })
  )
  writeFileSync(
    join(workspaceRoot, 'src', 'index.ts'),
    'export const value = 1\n'
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
    const repository = Repository.resolve({
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
    const repository = Repository.resolve({
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
})
