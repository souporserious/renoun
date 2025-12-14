import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'

import { parseAnnotations } from '../../utils/annotations.ts'

const mockTokens = vi.fn()

vi.mock('../../project/client.ts', () => ({
  getSourceTextMetadata: vi.fn(),
  getTokens: (...args: Parameters<typeof mockTokens>) => mockTokens(...args),
}))

vi.mock('../Config/ServerConfigContext.tsx', () => ({
  getConfig: async () => ({
    theme: 'default',
    languages: {},
  }),
}))

vi.mock('../../utils/get-theme.ts', () => ({
  BASE_TOKEN_CLASS_NAME: 'token',
  hasMultipleThemes: () => false,
  getThemeColors: async () => ({
    editor: {
      selectionBackground: 'transparent',
      selectionHighlight: 'transparent',
      hoverHighlightBackground: 'transparent',
      symbolHighlightBackground: 'transparent',
      symbolHighlight: 'transparent',
      errorForeground: 'currentColor',
      foreground: 'currentColor',
    },
    tokenColors: [],
    semanticTokenColors: [],
  }),
}))

vi.mock('../../utils/context.ts', () => ({
  createContext: () => ({}),
  getContext: () => null,
}))

vi.mock('../Config/ConfigProvider.ts', () => ({
  useConfigCache: () => ({ config: {} }),
}))

vi.mock('./Context.tsx', () => ({
  Context: {},
}))

vi.mock('./QuickInfoProvider.ts', () => ({
  QuickInfoProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock('./Symbol.ts', () => ({
  Symbol: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// The restyle CSS helper inserts inline styles into the component tree. Use a
// lightweight shim to keep the rendered HTML stable for assertions.
vi.mock('restyle/css', () => ({
  css: (styles: Record<string, any>) => [
    `token-${Object.keys(styles).length}`,
    () => null,
  ],
}))

// Use a predictable mark element when rendering annotations.
const annotations = {
  mark: ({ children }: { children?: React.ReactNode }) => (
    <mark>{children}</mark>
  ),
}

describe('Tokens', () => {
  test('does not duplicate block annotations when they start at a token boundary', async () => {
    const source = [
      "import { createContext } from 'react'",
      "const /*mark*/ThemeContext/**mark*/ = createContext(/*mark*/'light'/**mark*/)",
    ].join('\n')

    const parsed = parseAnnotations(source, Object.keys(annotations))
    const value = parsed.value
    const identifier = 'ThemeContext'
    const identifierStart = value.indexOf(identifier)
    const identifierEnd = identifierStart + identifier.length

    mockTokens.mockResolvedValueOnce([
      [
        {
          start: 0,
          end: identifierStart,
          value: value.slice(0, identifierStart),
        },
        { start: identifierStart, end: identifierEnd, value: identifier },
        {
          start: identifierEnd,
          end: value.length,
          value: value.slice(identifierEnd),
        },
      ],
    ])

    const { Tokens } = await import('./Tokens.tsx')
    const element = await Tokens({
      annotations,
      shouldAnalyze: false,
      children: source,
    })

    const markup = renderToStaticMarkup(<>{element}</>)
    const markCount = markup.match(/<mark>/g)?.length ?? 0

    expect(markCount).toBe(2)
  })
})
