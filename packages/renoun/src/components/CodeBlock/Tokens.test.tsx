import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { parseAnnotations } from '../../utils/annotations.ts'

const mockTokens = vi.fn()
const mockQuickInfoProvider = vi.fn()
const mockSymbol = vi.fn()

vi.mock('../../analysis/node-client.ts', () => ({
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
    editorHoverWidget: {
      border: 'transparent',
      background: 'transparent',
      foreground: 'currentColor',
    },
    panel: {
      border: 'transparent',
    },
    editorError: {
      foreground: 'currentColor',
    },
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

vi.mock('./QuickInfoProvider.tsx', () => ({
  QuickInfoProvider: ({
    children,
    entries,
  }: {
    children: React.ReactNode
    entries?: Array<{ id: string }>
  }) => {
    mockQuickInfoProvider({ entries })
    return <>{children}</>
  },
}))

vi.mock('./Symbol.tsx', () => ({
  Symbol: ({
    children,
    quickInfoId,
  }: {
    children: React.ReactNode
    quickInfoId?: string
  }) => {
    mockSymbol({ quickInfoId })
    return <>{children}</>
  },
}))

vi.mock('restyle/css', () => ({
  css: (styles: Record<string, any>) => [
    `token-${Object.keys(styles).length}`,
    () => null,
  ],
}))

const annotations = {
  mark: ({ children }: { children?: React.ReactNode }) => (
    <mark>{children}</mark>
  ),
}

describe('Tokens', () => {
  beforeEach(() => {
    mockTokens.mockReset()
    mockQuickInfoProvider.mockReset()
    mockSymbol.mockReset()
  })

  test('registers shared quick info entries and references them from symbols', async () => {
    mockTokens.mockResolvedValueOnce([
      [
        {
          start: 0,
          end: 6,
          value: 'export',
          isBaseColor: true,
        },
        {
          start: 6,
          end: 7,
          value: ' ',
          isWhiteSpace: true,
        },
        {
          start: 7,
          end: 13,
          value: 'Router',
          quickInfo: {
            displayText: 'const Router: typeof import("next/router")',
            documentationText: 'Navigate programmatically.',
          },
        },
      ],
    ])

    const { Tokens } = await import('./Tokens.tsx')
    const element = await Tokens({
      shouldAnalyze: false,
      children: 'export Router',
    })

    renderToStaticMarkup(<>{element}</>)

    expect(mockQuickInfoProvider).toHaveBeenCalledTimes(1)
    expect(mockQuickInfoProvider).toHaveBeenCalledWith({
      entries: [expect.objectContaining({ id: '0:2' })],
    })
    expect(mockSymbol).toHaveBeenCalledWith({
      quickInfoId: '0:2',
    })
  })

  test('deduplicates shared quick info entries for annotated token slices', async () => {
    const source = 'const The/*mark*/meCon/**mark*/text = 1'
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
        {
          start: identifierStart,
          end: identifierEnd,
          value: identifier,
          quickInfo: {
            displayText: 'const ThemeContext: Context<string>',
            documentationText: 'Annotated quick info.',
          },
        },
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

    renderToStaticMarkup(<>{element}</>)

    expect(mockQuickInfoProvider).toHaveBeenCalledTimes(1)
    expect(mockQuickInfoProvider).toHaveBeenCalledWith({
      entries: [expect.objectContaining({ id: '0:1' })],
    })
    expect(
      mockSymbol.mock.calls.every(([props]) => props.quickInfoId === '0:1')
    ).toBe(true)
  })

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
