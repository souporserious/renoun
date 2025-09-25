import { describe, expect, test } from 'vitest'

import { getProject } from '../project/get-project.js'
import { getFileExports } from './get-file-exports.js'

describe('getFileExports', () => {
  test('handles MaterialXNodes exports without throwing', () => {
    const project = getProject({ compilerOptions: { allowJs: true } })
    const fileExports = getFileExports('fixtures/hooks/index.js', project)
    const fileExport = fileExports.at(0)!

    expect(fileExport.name).toBe('useHover')
  })
})
