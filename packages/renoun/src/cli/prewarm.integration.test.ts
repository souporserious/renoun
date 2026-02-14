import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

import { getProject } from '../project/get-project.ts'
import { collectRenounPrewarmTargets } from './prewarm.ts'

const appSites = [
  {
    name: 'site',
    rootPath: fileURLToPath(new URL('../../../../apps/site', import.meta.url)),
    expectedDirectoryPaths: ['docs', 'guides'],
    expectedFileTargets: [],
  },
  {
    name: 'docs',
    rootPath: fileURLToPath(new URL('../../../../apps/docs', import.meta.url)),
    expectedDirectoryPaths: ['docs'],
    expectedFileTargets: [],
  },
  {
    name: 'blog',
    rootPath: fileURLToPath(new URL('../../../../apps/blog', import.meta.url)),
    expectedDirectoryPaths: ['posts'],
    expectedFileTargets: [],
  },
  {
    name: 'workbench',
    rootPath: fileURLToPath(
      new URL('../../../../apps/workbench', import.meta.url)
    ),
    expectedDirectoryPaths: ['components', 'hooks'],
    expectedFileTargets: [],
  },
]

function resolveExpectedPaths({
  rootPath,
  expectedDirectoryPaths,
  expectedFileTargets,
}: {
  rootPath: string
  expectedDirectoryPaths: string[]
  expectedFileTargets: string[]
}) {
  return {
    directoryGetEntries: expectedDirectoryPaths.map((directoryPath) =>
      resolve(rootPath, directoryPath)
    ),
    fileGetFile: expectedFileTargets.map((target) => {
      const [directoryPath, filePath] = target.split(':')
      return `${resolve(rootPath, directoryPath)}:${filePath}`
    }),
  }
}

describe('collectRenounPrewarmTargets app coverage', () => {
  test('collects granular directory and file prewarm targets for all app entrypoints', async () => {
    const targetsByApp = await Promise.all(
      appSites.map(async (app) => {
        const project = getProject({
          tsConfigFilePath: join(app.rootPath, 'tsconfig.json'),
        })
        const target = collectRenounPrewarmTargets(project, {
          tsConfigFilePath: join(app.rootPath, 'tsconfig.json'),
        })

        return { app, target }
      })
    )

    for (const { app, target } of targetsByApp) {
      const expected = resolveExpectedPaths(app)
      const discoveredDirectories = target.directoryGetEntries.map(
        (entry) => entry.directoryPath
      )
      const discoveredFiles = target.fileGetFile.map(
        (request) => `${request.directoryPath}:${request.path}`
      )

      for (const expectedDirectory of expected.directoryGetEntries) {
        expect(discoveredDirectories).toContain(expectedDirectory)
      }

      for (const expectedFile of expected.fileGetFile) {
        expect(discoveredFiles).toContain(expectedFile)
      }
    }
  })
})
