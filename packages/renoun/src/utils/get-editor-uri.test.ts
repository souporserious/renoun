import { describe, expect, it } from 'vitest'

import { getEditorUri } from './get-editor-uri.ts'

describe('getEditorUri', () => {
  it('defaults to vscode-compatible scheme', () => {
    expect(
      getEditorUri({
        path: '/workspace/renoun/packages/renoun/src/index.ts',
      })
    ).toBe(
      'vscode://file//workspace/renoun/packages/renoun/src/index.ts:0:0'
    )
  })

  it('supports the cursor editor scheme', () => {
    expect(
      getEditorUri({
        path: '/workspace/renoun/packages/renoun/src/index.ts',
        editor: 'cursor',
        line: 12,
        column: 4,
      })
    ).toBe(
      'cursor://file//workspace/renoun/packages/renoun/src/index.ts:12:4'
    )
  })
})
