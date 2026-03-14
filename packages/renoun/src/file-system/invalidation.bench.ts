import { bench, describe } from 'vitest'

import { InMemoryFileSystem } from './InMemoryFileSystem.ts'
import { Session } from './Session.ts'

const DIRECTORY_COUNT = 5_000
const INVALIDATION_PATH_COUNT = 96

describe('Session invalidation', () => {
  bench('invalidatePaths over indexed directory snapshots', () => {
    const files: Record<string, string> = {}
    for (let directoryIndex = 0; directoryIndex < DIRECTORY_COUNT; directoryIndex += 1) {
      files[`src/feature-${directoryIndex}/index.ts`] = `export const value = ${directoryIndex}`
    }

    const fileSystem = new InMemoryFileSystem(files)
    const session = Session.for(fileSystem)

    for (let directoryIndex = 0; directoryIndex < DIRECTORY_COUNT; directoryIndex += 1) {
      const snapshotKey = session.createDirectorySnapshotKey({
        directoryPath: `src/feature-${directoryIndex}`,
        mask: 1,
        filterSignature: 'bench:all',
        sortSignature: 'bench:none',
      })

      session.directorySnapshots.set(snapshotKey, {
        path: `src/feature-${directoryIndex}`,
      } as any)
    }

    const invalidationPaths = Array.from(
      { length: INVALIDATION_PATH_COUNT },
      (_value, index) => `src/feature-${index}/nested/file.ts`
    )

    session.invalidatePaths(invalidationPaths)
  })
})
