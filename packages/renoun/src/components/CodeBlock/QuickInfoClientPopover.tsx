'use client'
import React, { Fragment } from 'react'
import { styled, type CSSObject } from 'restyle'
import { getMarkdownContent } from '@renoun/mdx'
import { rehypePlugins } from '@renoun/mdx/rehype'
import { remarkPlugins } from '@renoun/mdx/remark'
import { Fragment as JsxFragment, jsx, jsxs } from 'react/jsx-runtime'

import type { TokenDiagnostic } from '../../utils/get-tokens.ts'
import {
  QuickInfoContent,
  QuickInfoDisplayText,
  QuickInfoDisplayToken,
  QuickInfoMarkdown,
  type QuickInfoTheme,
} from './QuickInfoContent.tsx'
import { CopyButtonClient } from '../CopyButton/CopyButtonClient.tsx'
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

const Paragraph = styled('p', {
  fontFamily: 'sans-serif',
  fontSize: 'inherit',
  lineHeight: 'inherit',
  margin: 0,
  textWrap: 'pretty',
})

const Table = styled('table', {
  borderCollapse: 'collapse',
  'th, td': {
    padding: '0.25em 0.75em',
    border: '1px solid var(--border)',
  },
})

const MarkdownCodeBlockContainer = styled('div', {
  position: 'relative',
  marginBlock: '0.35rem',
  borderRadius: 5,
  boxShadow: 'inset 0 0 0 1px var(--border)',
  overflow: 'hidden',
  backgroundColor: 'rgba(127, 127, 127, 0.08)',
})

const MarkdownCodeBlockToolbar = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  minHeight: '1.8rem',
  padding: '0.35rem 0.5rem',
  boxShadow: 'inset 0 -1px 0 0 var(--border)',
})

const MarkdownCodeBlockPath = styled('span', {
  minWidth: 0,
  fontFamily: 'monospace',
  fontSize: '0.75rem',
  lineHeight: 1.2,
  opacity: 0.8,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

const MarkdownCodeBlockPre = styled('pre', {
  position: 'relative',
  display: 'grid',
  gridAutoRows: 'max-content',
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordWrap: 'break-word',
})

const MarkdownCodeBlockLineNumbers = styled('span', {
  padding: '0.4rem 0.5rem',
  borderRight: '1px solid var(--border)',
  fontFamily: 'monospace',
  fontSize: '0.75rem',
  lineHeight: 1.5,
  textAlign: 'right',
  userSelect: 'none',
  whiteSpace: 'pre',
  opacity: 0.55,
})

const MarkdownCodeBlockCode = styled('code', {
  display: 'block',
  minWidth: 0,
  padding: '0.4rem 0.5rem',
  fontFamily: 'monospace',
  fontSize: '0.78rem',
  lineHeight: 1.5,
  color: 'inherit',
  backgroundColor: 'transparent',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
})

const quickInfoDocumentationContentCache = new Map<
  string,
  Promise<React.ReactNode>
>()

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
    return resolveQuickInfoTokenThemeConfig(
      request?.themeConfig,
      activeThemeName
    )
  }, [activeThemeName, request?.themeConfig])
  const { isLoading, resolvedQuickInfo, resolvedDisplayTokens } =
    useResolvedQuickInfoClientState({
      quickInfo,
      request,
      tokenThemeConfig,
    })
  const displayText = resolvedQuickInfo?.displayText || ''
  const documentationText = resolvedQuickInfo?.documentationText || ''

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
        !isLoading && documentationText ? (
          <React.Suspense fallback={null}>
            <QuickInfoDocumentationMarkdown
              documentationText={documentationText}
              theme={theme}
            />
          </React.Suspense>
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
  if (
    !themeConfig ||
    typeof themeConfig === 'string' ||
    Array.isArray(themeConfig)
  ) {
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

function QuickInfoDocumentationMarkdown({
  documentationText,
  theme,
}: {
  documentationText: string
  theme: QuickInfoTheme
}) {
  const content = React.use(getQuickInfoDocumentationContent(documentationText))

  return (
    <QuickInfoMarkdown
      css={{
        '--border': theme.panelBorder,
        color: theme.foreground,
      }}
    >
      {content}
    </QuickInfoMarkdown>
  )
}

function getQuickInfoDocumentationContent(
  documentationText: string
): Promise<React.ReactNode> {
  const cached = quickInfoDocumentationContentCache.get(documentationText)
  if (cached) {
    return cached
  }

  const contentPromise = getMarkdownContent({
    source: documentationText,
    components: {
      CodeBlock: (props) => {
        return <QuickInfoMarkdownCodeBlock {...props} />
      },
      p: Paragraph,
      table: Table,
    },
    remarkPlugins,
    rehypePlugins,
    runtime: {
      Fragment: JsxFragment,
      jsx,
      jsxs,
    },
  }).catch((error) => {
    quickInfoDocumentationContentCache.delete(documentationText)
    throw error
  })

  quickInfoDocumentationContentCache.set(documentationText, contentPromise)
  return contentPromise
}

function QuickInfoMarkdownCodeBlock({
  path,
  language,
  allowCopy,
  showLineNumbers = false,
  showToolbar,
  children,
  className,
  style,
}: {
  path?: string
  language?: string
  allowCopy?: boolean | string
  showLineNumbers?: boolean
  showToolbar?: boolean
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const value = resolveQuickInfoMarkdownCodeValue(children)
  const shouldRenderToolbar = Boolean(
    showToolbar === undefined ? path || allowCopy : showToolbar
  )
  const copyValue = typeof allowCopy === 'string' ? allowCopy : value
  const shouldRenderCopyButton =
    allowCopy !== false && typeof copyValue === 'string' && copyValue.length > 0
  const lineCount = Math.max(1, value.split('\n').length)
  const lineNumbers = Array.from({ length: lineCount }, (_, index) => {
    return index + 1
  }).join('\n')
  const codeClassName =
    language && language.length > 0 ? `language-${language}` : undefined

  return (
    <MarkdownCodeBlockContainer>
      {shouldRenderToolbar ? (
        <MarkdownCodeBlockToolbar>
          {path ? <MarkdownCodeBlockPath>{path}</MarkdownCodeBlockPath> : null}
          {shouldRenderCopyButton ? (
            <CopyButtonClient
              value={copyValue}
              css={{
                marginLeft: 'auto',
                color: 'inherit',
                opacity: 0.75,
              }}
            />
          ) : null}
        </MarkdownCodeBlockToolbar>
      ) : null}
      <MarkdownCodeBlockPre
        className={className}
        style={style}
        css={{
          gridTemplateColumns: showLineNumbers ? 'auto 1fr' : undefined,
        }}
      >
        {showLineNumbers ? (
          <MarkdownCodeBlockLineNumbers>{lineNumbers}</MarkdownCodeBlockLineNumbers>
        ) : null}
        <MarkdownCodeBlockCode
          className={codeClassName}
          css={{
            gridColumn: showLineNumbers ? 2 : 1,
            paddingRight:
              !shouldRenderToolbar && shouldRenderCopyButton ? '2rem' : undefined,
          }}
        >
          {value}
        </MarkdownCodeBlockCode>
        {!shouldRenderToolbar && shouldRenderCopyButton ? (
          <CopyButtonClient
            value={copyValue}
            css={{
              position: 'absolute',
              top: '0.4rem',
              right: '0.4rem',
              color: 'inherit',
              backgroundColor: 'rgba(0, 0, 0, 0.18)',
              borderRadius: 4,
            }}
          />
        ) : null}
      </MarkdownCodeBlockPre>
    </MarkdownCodeBlockContainer>
  )
}

function resolveQuickInfoMarkdownCodeValue(children: React.ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children)
  }

  if (Array.isArray(children)) {
    return children.map(resolveQuickInfoMarkdownCodeValue).join('')
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(children)) {
    return resolveQuickInfoMarkdownCodeValue(children.props.children)
  }

  return ''
}

function subscribeToQuickInfoThemeChanges(
  onStoreChange: () => void
): () => void {
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

export const __TEST_ONLY__ = {
  getQuickInfoDocumentationContent,
}
