'use client'
import React, { Fragment } from 'react'
import { styled, type CSSObject } from 'restyle'
import { getMarkdownContent } from '@renoun/mdx'
import { rehypePlugins } from '@renoun/mdx/rehype'
import { remarkPlugins } from '@renoun/mdx/remark'
import { Fragment as JsxRuntimeFragment, jsx, jsxs } from 'react/jsx-runtime'

import type { TokenDiagnostic } from '../../utils/get-tokens.ts'
import {
  QuickInfoContent,
  QuickInfoDisplayText,
  QuickInfoDisplayToken,
  QuickInfoDocumentationText,
  QuickInfoMarkdown,
  type QuickInfoTheme,
} from './QuickInfoContent.tsx'
import { useQuickInfoContext } from './QuickInfoProvider.tsx'
import {
  type QuickInfoData,
  type QuickInfoRequest,
  type QuickInfoTokenizedDisplayText,
  useResolvedQuickInfoClientState,
} from './QuickInfoClientState.tsx'

const QUICK_INFO_KEYWORDS = new Set([
  'abstract',
  'as',
  'async',
  'await',
  'class',
  'const',
  'constructor',
  'declare',
  'default',
  'enum',
  'export',
  'extends',
  'false',
  'from',
  'function',
  'get',
  'implements',
  'import',
  'in',
  'infer',
  'interface',
  'is',
  'keyof',
  'let',
  'module',
  'namespace',
  'new',
  'null',
  'private',
  'protected',
  'public',
  'readonly',
  'return',
  'set',
  'static',
  'this',
  'true',
  'type',
  'typeof',
  'undefined',
  'var',
  'void',
])

const QUICK_INFO_TOKEN_PATTERN =
  /('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[A-Za-z_$][A-Za-z0-9_$]*|\d+(?:\.\d+)?|[\r\n]+|[ \t]+|[^\sA-Za-z0-9_$]+)/g
const QUICK_INFO_TEST_IDS_ENABLED = process.env.NODE_ENV === 'test'

function getQuickInfoTestId(
  id: 'content' | 'divider' | 'display'
): string | undefined {
  if (!QUICK_INFO_TEST_IDS_ENABLED) {
    return undefined
  }

  if (id === 'content') {
    return 'quick-info-content'
  }

  if (id === 'display') {
    return 'quick-info-display'
  }

  return 'quick-info-divider'
}

export function QuickInfoClientPopover({
  diagnostics,
  quickInfo,
  request,
  theme,
  css,
  className,
  style,
}: {
  diagnostics?: TokenDiagnostic[]
  quickInfo?: QuickInfoData
  request?: QuickInfoRequest
  theme: QuickInfoTheme
  css?: CSSObject
  className?: string
  style?: React.CSSProperties
}) {
  const { quickInfo: activeQuickInfo } = useQuickInfoContext()
  const activeThemeName = useActiveThemeName(activeQuickInfo?.anchorId)
  const tokenThemeConfig = React.useMemo(() => {
    return resolveQuickInfoTokenThemeConfig(request?.themeConfig, activeThemeName)
  }, [activeThemeName, request?.themeConfig])
  const {
    isLoading,
    resolvedQuickInfo,
    resolvedDisplayTokens,
  } = useResolvedQuickInfoClientState({
    quickInfo,
    request,
    tokenThemeConfig,
  })
  const displayText = resolvedQuickInfo?.displayText || ''
  const documentationText = resolvedQuickInfo?.documentationText || ''
  const resolvedDocumentationContent =
    useResolvedQuickInfoDocumentation(documentationText)

  return (
    <QuickInfoContent
      diagnostics={diagnostics}
      isLoading={isLoading}
      display={
        !isLoading && displayText ? (
          <QuickInfoDisplayText data-testid={getQuickInfoTestId('display')}>
            {resolvedDisplayTokens
              ? renderTokenizedDisplayText(resolvedDisplayTokens)
              : renderHighlightedDisplayText(displayText)}
          </QuickInfoDisplayText>
        ) : undefined
      }
      documentation={
        !isLoading &&
        documentationText.length &&
        resolvedDocumentationContent !== null ? (
          typeof resolvedDocumentationContent === 'string' ? (
            <QuickInfoDocumentationText>
              {resolvedDocumentationContent}
            </QuickInfoDocumentationText>
          ) : (
            <QuickInfoMarkdown>{resolvedDocumentationContent}</QuickInfoMarkdown>
          )
        ) : undefined
      }
      theme={theme}
      css={css}
      className={className}
      style={style}
      testIds={{
        container: 'quick-info-popover',
        content: getQuickInfoTestId('content'),
        divider: getQuickInfoTestId('divider'),
      }}
    />
  )
}

function useActiveThemeName(anchorId: string | undefined): string | undefined {
  return React.useSyncExternalStore(
    subscribeToQuickInfoThemeChanges,
    () => readActiveThemeName(anchorId),
    () => readActiveThemeName(anchorId)
  )
}

function useResolvedQuickInfoDocumentation(
  documentationText: string
): React.ReactNode | string | null {
  const [resolvedDocumentationContent, setResolvedDocumentationContent] =
    React.useState<React.ReactNode | string | null>(null)

  React.useEffect(() => {
    let isDisposed = false

    if (!documentationText) {
      setResolvedDocumentationContent(null)
      return
    }

    setResolvedDocumentationContent(null)
    void renderQuickInfoDocumentationContent(documentationText)
      .then((value) => {
        if (!isDisposed) {
          setResolvedDocumentationContent(value)
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setResolvedDocumentationContent(documentationText)
        }
      })

    return () => {
      isDisposed = true
    }
  }, [documentationText])

  return resolvedDocumentationContent
}

function renderTokenizedDisplayText(
  lines: QuickInfoTokenizedDisplayText
): React.ReactNode {
  return lines.map((line, lineIndex) => {
    return (
      <Fragment key={lineIndex}>
        {lineIndex === 0 ? null : '\n'}
        {line.map((token, tokenIndex) => {
          return (
            <QuickInfoDisplayToken
              key={tokenIndex}
              style={resolveDisplayTokenStyle(token.style)}
            >
              {token.value}
            </QuickInfoDisplayToken>
          )
        })}
      </Fragment>
    )
  })
}

function resolveDisplayTokenStyle(
  style: Record<string, string>
): React.CSSProperties {
  const resolvedStyle: React.CSSProperties = {}
  const color = resolveDisplayTokenStyleValue(style, 'fg', 'color')
  if (color) {
    resolvedStyle.color = color
  }

  const fontStyle = resolveDisplayTokenStyleValue(style, 'fs', 'fontStyle')
  if (fontStyle) {
    resolvedStyle.fontStyle = fontStyle
  }

  const fontWeight = resolveDisplayTokenStyleValue(style, 'fw', 'fontWeight')
  if (fontWeight) {
    resolvedStyle.fontWeight = fontWeight
  }

  const textDecoration = resolveDisplayTokenStyleValue(
    style,
    'td',
    'textDecoration'
  )
  if (textDecoration) {
    resolvedStyle.textDecoration = textDecoration
  }

  return resolvedStyle
}

function resolveDisplayTokenStyleValue(
  style: Record<string, string>,
  styleSuffix: 'fg' | 'fs' | 'fw' | 'td',
  directProperty: 'color' | 'fontStyle' | 'fontWeight' | 'textDecoration'
): string | undefined {
  const directValue = style[directProperty]
  if (typeof directValue === 'string' && directValue.length > 0) {
    return directValue
  }

  for (const [key, value] of Object.entries(style)) {
    if (
      key.startsWith('--') &&
      key.endsWith(styleSuffix) &&
      typeof value === 'string' &&
      value.length > 0
    ) {
      return value
    }
  }

  return undefined
}

function renderHighlightedDisplayText(displayText: string): React.ReactNode {
  const parts = displayText.match(QUICK_INFO_TOKEN_PATTERN) ?? [displayText]

  return parts.map((part, index) => {
    if (part === '\n' || part === '\r\n' || part === '\r') {
      return <Fragment key={index}>{part}</Fragment>
    }

    if (/^['"`]/.test(part)) {
      return <StringToken key={index}>{part}</StringToken>
    }

    if (QUICK_INFO_KEYWORDS.has(part)) {
      return <KeywordToken key={index}>{part}</KeywordToken>
    }

    if (/^[A-Z][A-Za-z0-9_$]*$/.test(part)) {
      return <TypeToken key={index}>{part}</TypeToken>
    }

    return <Fragment key={index}>{part}</Fragment>
  })
}

function resolveQuickInfoTokenThemeConfig(
  themeConfig: QuickInfoRequest['themeConfig'],
  activeThemeName: string | undefined
): QuickInfoRequest['themeConfig'] {
  if (!themeConfig || typeof themeConfig === 'string' || Array.isArray(themeConfig)) {
    return themeConfig
  }

  const themeNames = Object.keys(themeConfig)
  if (themeNames.length === 0) {
    return themeConfig
  }

  const selectedThemeName =
    activeThemeName &&
    Object.prototype.hasOwnProperty.call(themeConfig, activeThemeName)
      ? activeThemeName
      : themeNames[0]

  if (!selectedThemeName) {
    return themeConfig
  }

  return {
    [selectedThemeName]: themeConfig[selectedThemeName]!,
  }
}

function readActiveThemeName(anchorId: string | undefined): string | undefined {
  if (typeof document === 'undefined') {
    return undefined
  }

  const anchorNode =
    typeof anchorId === 'string' && anchorId.length > 0
      ? document.getElementById(anchorId)
      : null
  const themedElement = anchorNode?.closest('[data-theme]')
  if (themedElement instanceof HTMLElement) {
    const themedName = themedElement.getAttribute('data-theme')
    if (typeof themedName === 'string' && themedName.length > 0) {
      return themedName
    }
  }

  const documentTheme = document.documentElement.getAttribute('data-theme')
  if (typeof documentTheme === 'string' && documentTheme.length > 0) {
    return documentTheme
  }

  const bodyTheme = document.body?.getAttribute('data-theme')
  if (typeof bodyTheme === 'string' && bodyTheme.length > 0) {
    return bodyTheme
  }

  return undefined
}

function subscribeToQuickInfoThemeChanges(onStoreChange: () => void): () => void {
  if (
    typeof document === 'undefined' ||
    typeof MutationObserver !== 'function'
  ) {
    return () => {}
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === 'attributes' &&
        mutation.attributeName === 'data-theme'
      ) {
        onStoreChange()
        return
      }
    }
  })

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
    subtree: true,
  })

  return () => {
    observer.disconnect()
  }
}

async function renderQuickInfoDocumentationContent(
  documentationText: string
): Promise<React.ReactNode> {
  return getMarkdownContent({
    source: documentationText,
    components: quickInfoMarkdownComponents,
    remarkPlugins,
    rehypePlugins,
    runtime: {
      Fragment: JsxRuntimeFragment,
      jsx,
      jsxs,
    },
  })
}

const KeywordToken = styled('span', {
  color: 'var(--renoun-quick-info-keyword, #82aaff)',
  fontStyle: 'italic',
})

const TypeToken = styled('span', {
  color: 'var(--renoun-quick-info-type, #86e1fc)',
})

const StringToken = styled('span', {
  color: 'var(--renoun-quick-info-string, #ecc48d)',
})

const Paragraph = styled('p', {
  margin: 0,
  textWrap: 'pretty',
})

const Table = styled('table', {
  borderCollapse: 'collapse',
  'th, td': {
    padding: '0.25em 0.75em',
    border: '1px solid var(--renoun-quick-info-table-border, currentColor)',
  },
})

function QuickInfoMarkdownCodeBlock({
  children,
}: {
  children?: React.ReactNode
}) {
  return (
    <DocumentationCodeBlock>
      <code>{children}</code>
    </DocumentationCodeBlock>
  )
}

const quickInfoMarkdownComponents = {
  CodeBlock: QuickInfoMarkdownCodeBlock,
  p: Paragraph,
  table: Table,
}

const DocumentationCodeBlock = styled('pre', {
  margin: '0.25rem 0',
  padding: '0.35rem 0.5rem',
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  lineHeight: 1.35,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
  borderRadius: 4,
  backgroundColor: 'color-mix(in oklab, currentColor 10%, transparent)',
})
