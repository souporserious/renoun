import { describe, expect, test } from 'vitest'

import {
  parseGitStatusPorcelainV1Z,
  parseNullTerminatedGitPathList,
} from './git-status.ts'

describe('git-status parser', () => {
  test('parses null-terminated git path lists', () => {
    const output = 'src/a.ts\0src/b.ts\0'

    expect(parseNullTerminatedGitPathList(output)).toEqual([
      'src/a.ts',
      'src/b.ts',
    ])
  })

  test('does not split regular paths containing " -> "', () => {
    const output = ` M src/feature -> docs.ts\0`
    const entries = parseGitStatusPorcelainV1Z(output)

    expect(entries).toEqual([
      {
        status: ' M',
        paths: ['src/feature -> docs.ts'],
      },
    ])
  })

  test('preserves unicode paths and parses rename records from porcelain-z output', () => {
    const output = [
      '?? src/café.ts',
      // `git status --porcelain=1 -z` emits destination then source for renames.
      'R  src/new-name.ts',
      'src/old-name.ts',
    ].join('\0') + '\0'

    const entries = parseGitStatusPorcelainV1Z(output)

    expect(entries).toEqual([
      {
        status: '??',
        paths: ['src/café.ts'],
      },
      {
        status: 'R ',
        paths: ['src/new-name.ts', 'src/old-name.ts'],
      },
    ])
  })
})
