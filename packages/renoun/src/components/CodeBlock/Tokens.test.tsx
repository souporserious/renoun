import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { parseAnnotations } from '../../utils/annotations.ts'

const mockTokens = vi.fn()
const mockGetCodeBlockTokens = vi.fn()
const mockQuickInfoProvider = vi.fn()
const mockSymbol = vi.fn()
const mockGetContext = vi.fn()

vi.mock('../../analysis/node-client.ts', () => ({
  getCodeBlockTokens: (...args: Parameters<typeof mockGetCodeBlockTokens>) =>
    mockGetCodeBlockTokens(...args),
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
  getContext: (...args: Parameters<typeof mockGetContext>) =>
    mockGetContext(...args),
}))

vi.mock('../Config/ConfigProvider.ts', () => ({
  useConfigCache: () => ({ config: {} }),
}))

vi.mock('./Context.tsx', () => ({
  Context: {},
}))

vi.mock('./QuickInfoProvider.tsx', () => ({
  DefaultQuickInfoPopover: ({
    className,
    style,
    quickInfo,
    isLoading,
  }: {
    className?: string
    style?: React.CSSProperties
    quickInfo?: { displayText: string }
    isLoading?: boolean
  }) => (
    <div className={className} style={style}>
      {isLoading ? 'loading' : quickInfo?.displayText}
    </div>
  ),
  QuickInfoProvider: ({
    children,
    entries,
    PopoverComponent,
  }: {
    children: React.ReactNode
    entries?: Array<{ id: string }>
    PopoverComponent?: React.ComponentType<any>
  }) => {
    mockQuickInfoProvider({ entries, PopoverComponent })
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
    mockGetCodeBlockTokens.mockReset()
    mockQuickInfoProvider.mockReset()
    mockSymbol.mockReset()
    mockGetContext.mockReset()
    mockGetContext.mockReturnValue(null)
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
    expect(mockQuickInfoProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [expect.objectContaining({ id: '0:2' })],
        PopoverComponent: expect.any(Function),
      })
    )
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
    expect(mockQuickInfoProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [expect.objectContaining({ id: '0:1' })],
        PopoverComponent: expect.any(Function),
      })
    )
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

  test('path null disables inherited file paths for shell snippets', async () => {
    mockGetContext.mockReturnValue({
      filePath: 'build-a-button-component-in-react.mdx',
      label: 'build-a-button-component-in-react.mdx',
    })
    mockTokens.mockResolvedValueOnce([
      [
        {
          start: 0,
          end: 16,
          value: 'pnpm add renoun',
          isBaseColor: true,
        },
      ],
    ])

    const { Tokens } = await import('./Tokens.tsx')

    await Tokens({
      children: 'pnpm add renoun',
      language: 'shell',
      path: null,
      shouldFormat: false,
    })

    expect(mockTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'shell',
        filePath: undefined,
      })
    )
  })

  test('explicit paths override inherited file paths', async () => {
    mockGetContext.mockReturnValue({
      filePath: 'build-a-button-component-in-react.mdx',
      label: 'build-a-button-component-in-react.mdx',
    })
    mockTokens.mockResolvedValueOnce([
      [
        {
          start: 0,
          end: 15,
          value: 'echo "renoun"',
          isBaseColor: true,
        },
      ],
    ])

    const { Tokens } = await import('./Tokens.tsx')

    await Tokens({
      children: 'echo "renoun"',
      language: 'shell',
      path: 'install.sh',
      shouldAnalyze: false,
      shouldFormat: false,
    })

    expect(mockTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'shell',
        filePath: 'install.sh',
      })
    )
  })

  test('uses combined code block analysis when source metadata is required', async () => {
    mockGetCodeBlockTokens.mockResolvedValueOnce({
      metadata: {
        value: 'const Component = () => <div />',
        language: 'tsx',
        filePath: '_renoun/component.tsx',
        label: 'component.tsx',
        valueSignature: 'component-signature',
      },
      tokens: [
        [
          {
            start: 0,
            end: 5,
            value: 'const',
            hasTextStyles: true,
          },
        ],
      ],
    })

    const { Tokens } = await import('./Tokens.tsx')

    await Tokens({
      children: 'const Component = () => <div />',
      language: 'tsx',
      shouldFormat: false,
    })

    expect(mockGetCodeBlockTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'tsx',
        value: 'const Component = () => <div />',
        shouldFormat: false,
        waitForWarmResult: false,
      })
    )
    expect(mockTokens).not.toHaveBeenCalled()
  })

  test('applies token slot prop overrides', async () => {
    mockTokens.mockResolvedValueOnce([
      [
        {
          start: 0,
          end: 5,
          value: 'const',
          hasTextStyles: true,
        },
      ],
    ])

    const { Tokens } = await import('./Tokens.tsx')
    const element = await Tokens({
      shouldAnalyze: false,
      children: 'const',
      components: {
        Token: {
          className: 'custom-token',
        },
      },
    })

    const markup = renderToStaticMarkup(<>{element}</>)

    expect(markup).toContain('custom-token')
  })

  test('applies popover slot prop overrides', async () => {
    mockTokens.mockResolvedValueOnce([
      [
        {
          start: 0,
          end: 6,
          value: 'Router',
          quickInfo: {
            displayText: 'const Router: Router',
            documentationText: 'Navigate programmatically.',
          },
        },
      ],
    ])

    const { Tokens } = await import('./Tokens.tsx')
    const element = await Tokens({
      shouldAnalyze: false,
      children: 'Router',
      components: {
        Popover: {
          className: 'custom-popover',
        },
      },
    })

    renderToStaticMarkup(<>{element}</>)

    const popoverComponent = mockQuickInfoProvider.mock.calls[0]?.[0]
      ?.PopoverComponent as React.ComponentType<any> | undefined

    expect(popoverComponent).toBeDefined()

    const markup = renderToStaticMarkup(
      React.createElement(popoverComponent!, {
        theme: {
          background: '#000',
          foreground: '#fff',
          panelBorder: '#333',
          errorForeground: '#f00',
        },
        isLoading: true,
      })
    )

    expect(markup).toContain('custom-popover')
  })

  test('rejects unknown component override keys', async () => {
    const { Tokens } = await import('./Tokens.tsx')

    await expect(
      Tokens({
        shouldAnalyze: false,
        children: 'const',
        components: {
          Unknown: {},
        } as any,
      })
    ).rejects.toThrow(
      '[renoun] Unknown Tokens component override "Unknown". Valid keys are: Token, Error, Popover.'
    )
  })
})
