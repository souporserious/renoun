import { describe, test, expect } from 'vitest'

import { getSharedDirectoryPath } from './get-shared-directory-path.ts'

describe('getSharedDirectoryPath', () => {
  test.concurrent('finds the first shared directory for a set of files', () => {
    expect(
      getSharedDirectoryPath(
        '/Users/username/system/src/index.ts',
        '/Users/username/system/src/components/Alert.ts',
        '/Users/username/system/src/components/Button.ts'
      )
    ).toBe('/Users/username/system/src')
  })
})
