import { findCommonRootPath } from './find-common-root-path'

describe('findCommonRootPath', () => {
  test('finds the common root path', () => {
    expect(
      findCommonRootPath([
        '/Users/username/system/src/index.ts',
        '/Users/username/system/src/components/Alert.ts',
        '/Users/username/system/src/components/Button.ts',
      ])
    ).toBe('/Users/username/system/src')
  })
})
