import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'

import { parseAnnotations } from '../../utils/annotations.ts'
import { getSourceTextMetadata } from '../../analysis/client.ts'

const mockTokens = vi.fn()
const symbolMock = vi.fn(
  ({
    children,
  }: {
    children: React.ReactNode
  }) => <>{children}</>
)

vi.mock('../../analysis/client.ts', () => ({
  getAnalysisClientBrowserRuntime: () => undefined,
  getAnalysisClientRefreshVersion: () => '0:0',
  getQuickInfoAtPosition: vi.fn(),
  getSourceTextMetadata: vi.fn(),
  getTokens: (...args: Parameters<typeof mockTokens>) => mockTokens(...args),
  hasRetainedAnalysisClientBrowserRuntime: () => false,
  onAnalysisClientBrowserRuntimeRetentionChange: () => () => {},
  onAnalysisClientBrowserRefreshNotification: () => () => {},
  onAnalysisClientBrowserRuntimeChange: () => () => {},
  onAnalysisClientRefreshVersionChange: () => () => {},
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

vi.mock('./Symbol.tsx', () => ({
  Symbol: (...args: Parameters<typeof symbolMock>) => symbolMock(...args),
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
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'

    try {
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
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }
    }
  })

  test('skips source metadata lookup for inline parser-less languages in development', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    try {
      const getSourceTextMetadataMock = vi.mocked(getSourceTextMetadata)
      getSourceTextMetadataMock.mockClear()

      mockTokens.mockResolvedValueOnce([
        [
          {
            start: 0,
            end: 8,
            value: 'echo hi\n',
            hasTextStyles: false,
            isBaseColor: true,
            isWhiteSpace: false,
            isDeprecated: false,
            isSymbol: false,
            style: {},
          },
        ],
      ])

      const { Tokens } = await import('./Tokens.tsx')

      await Tokens({
        children: 'echo hi\n',
        language: 'shell',
        shouldAnalyze: true,
        shouldFormat: true,
      })

      expect(getSourceTextMetadataMock).not.toHaveBeenCalled()
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }
    }
  })

  test('does not enable quick-info request mode outside development runtime', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    const previousServerPort = process.env.RENOUN_SERVER_PORT
    const previousServerId = process.env.RENOUN_SERVER_ID
    process.env.NODE_ENV = 'production'
    process.env.RENOUN_SERVER_PORT = '43123'
    process.env.RENOUN_SERVER_ID = 'tokens-production-runtime'

    try {
      symbolMock.mockClear()
      const getSourceTextMetadataMock = vi.mocked(getSourceTextMetadata)
      getSourceTextMetadataMock.mockResolvedValueOnce({
        value: 'History',
        language: 'ts',
        filePath: '/tmp/history.ts',
        label: '/tmp/history.ts',
      })
      mockTokens.mockResolvedValueOnce([
        [
          {
            value: 'History',
            start: 0,
            end: 7,
            hasTextStyles: true,
            isBaseColor: false,
            isDeprecated: false,
            isSymbol: true,
            isWhiteSpace: false,
            style: {},
          },
        ],
      ])

      const { Tokens } = await import('./Tokens.tsx')
      const element = await Tokens({
        children: 'History',
        language: 'ts',
        shouldAnalyze: true,
      })
      renderToStaticMarkup(<>{element}</>)

      expect(symbolMock).not.toHaveBeenCalled()
    } finally {
      if (previousServerPort === undefined) {
        delete process.env.RENOUN_SERVER_PORT
      } else {
        process.env.RENOUN_SERVER_PORT = previousServerPort
      }

      if (previousServerId === undefined) {
        delete process.env.RENOUN_SERVER_ID
      } else {
        process.env.RENOUN_SERVER_ID = previousServerId
      }

      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }
    }
  })

  test('virtualizes explicit snippet paths during analysis', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    try {
      const getSourceTextMetadataMock = vi.mocked(getSourceTextMetadata)
      getSourceTextMetadataMock.mockResolvedValueOnce({
        value: 'History',
        language: 'ts',
        filePath: '/tmp/history.__renoun_snippet_sig_1.ts',
        label: '/tmp/history.ts',
        valueSignature: 'sig-1',
      })
      mockTokens.mockResolvedValueOnce([
        [
          {
            value: 'History',
            start: 0,
            end: 7,
            hasTextStyles: true,
            isBaseColor: false,
            isDeprecated: false,
            isSymbol: true,
            isWhiteSpace: false,
            style: {},
          },
        ],
      ])

      const { Tokens } = await import('./Tokens.tsx')
      const element = await Tokens({
        children: 'History',
        path: '/tmp/history.ts',
        language: 'ts',
        shouldAnalyze: true,
      })
      renderToStaticMarkup(<>{element}</>)

      expect(getSourceTextMetadataMock).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: '/tmp/history.ts',
          value: 'History',
          virtualizeFilePath: true,
        })
      )
      expect(mockTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: '/tmp/history.__renoun_snippet_sig_1.ts',
          value: 'History',
        })
      )
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }
    }
  })

  test('passes a serializable popover prop to Symbol', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'

    try {
      symbolMock.mockClear()
      mockTokens.mockResolvedValueOnce([
        [
          {
            value: 'Directory',
            start: 0,
            end: 9,
            hasTextStyles: true,
            isBaseColor: false,
            isDeprecated: false,
            isSymbol: true,
            isWhiteSpace: false,
            quickInfo: {
              displayText: '(alias) class Directory',
              documentationText: 'A directory in the file system.',
            },
            style: {},
          },
        ],
      ])

      const { Tokens } = await import('./Tokens.tsx')
      const element = await Tokens({
        children: 'Directory',
        language: 'ts',
        shouldAnalyze: false,
      })
      renderToStaticMarkup(<>{element}</>)

      expect(symbolMock).toHaveBeenCalled()
      const props = symbolMock.mock.calls[0]?.[0] as
        | { popover?: unknown }
        | undefined
      expect(typeof props?.popover).not.toBe('function')
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }
    }
  })
})
