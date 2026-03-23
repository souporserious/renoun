import { describe, expect, test, vi } from 'vitest'

import {
  DirectorySnapshot,
  type PersistedDirectorySnapshotV1,
} from './directory-snapshot.ts'

describe('DirectorySnapshot', () => {
  test('restores persisted child snapshots lazily', () => {
    const persisted: PersistedDirectorySnapshotV1 = {
      version: 2,
      path: 'src',
      hasVisibleDescendant: true,
      shouldIncludeSelf: true,
      lastValidatedAt: 1,
      filterSignature: '',
      sortSignature: '',
      dependencySignatures: [],
      entries: [
        {
          kind: 'directory',
          path: 'src/nested',
          snapshot: {
            version: 2,
            path: 'src/nested',
            hasVisibleDescendant: true,
            shouldIncludeSelf: true,
            lastValidatedAt: 1,
            filterSignature: '',
            sortSignature: '',
            dependencySignatures: [],
            entries: [
              {
                kind: 'directory',
                path: 'src/nested/deeper',
                snapshot: {
                  version: 2,
                  path: 'src/nested/deeper',
                  hasVisibleDescendant: true,
                  shouldIncludeSelf: true,
                  lastValidatedAt: 1,
                  filterSignature: '',
                  sortSignature: '',
                  dependencySignatures: [],
                  entries: [
                    {
                      kind: 'file',
                      path: 'src/nested/deeper/file.ts',
                    },
                  ],
                  flatEntries: [
                    {
                      kind: 'file',
                      path: 'src/nested/deeper/file.ts',
                    },
                  ],
                },
              },
            ],
            flatEntries: [
              {
                kind: 'directory',
                path: 'src/nested/deeper',
              },
              {
                kind: 'file',
                path: 'src/nested/deeper/file.ts',
              },
            ],
          },
        },
      ],
      flatEntries: [
        {
          kind: 'directory',
          path: 'src/nested',
        },
        {
          kind: 'directory',
          path: 'src/nested/deeper',
        },
        {
          kind: 'file',
          path: 'src/nested/deeper/file.ts',
        },
      ],
    }

    const createDirectory = vi.fn((path: string) => ({
      kind: 'directory' as const,
      path,
    }))
    const createFile = vi.fn((path: string) => ({
      kind: 'file' as const,
      path,
    }))

    const restored = DirectorySnapshot.fromPersistedSnapshot(persisted, {
      createDirectory,
      createFile,
    })

    expect(createDirectory).toHaveBeenCalledTimes(1)
    expect(createFile).not.toHaveBeenCalled()

    const entries = restored.materialize()

    expect(createDirectory).toHaveBeenCalledTimes(2)
    expect(createFile).toHaveBeenCalledTimes(1)
    expect(entries).toEqual([
      { kind: 'directory', path: 'src/nested' },
      { kind: 'directory', path: 'src/nested/deeper' },
      { kind: 'file', path: 'src/nested/deeper/file.ts' },
    ])
  })
})
