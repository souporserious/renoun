'use client'
import React, { Fragment } from 'react'
import { styled, type CSSObject } from 'restyle'
import { css } from 'restyle/css'
import { getMarkdownContent } from '@renoun/mdx'
import { rehypePlugins } from '@renoun/mdx/rehype'
import { remarkPlugins } from '@renoun/mdx/remark'
import { Fragment as JsxFragment, jsx, jsxs } from 'react/jsx-runtime'

import { getTokens as getAnalysisClientTokens } from '../../analysis/browser-client.ts'
import type { AnalysisServerRuntime } from '../../analysis/runtime-env.ts'
import type { Languages as GrammarLanguage } from '../../grammars/index.ts'
import type { TokenDiagnostic } from '../../utils/get-tokens.ts'
import type { TokenizedLines } from '../../utils/get-tokens.ts'
import { stableStringify } from '../../utils/stable-serialization.ts'
import type { ConfigurationOptions } from '../Config/types.ts'
import {
  QuickInfoContent,
  QuickInfoDisplayText,
  QuickInfoDisplayToken,
  QuickInfoDocumentationText,
  QuickInfoMarkdown,
  type QuickInfoTheme,
} from './QuickInfoContent.tsx'
import { useQuickInfoContext } from './QuickInfoProvider.tsx'

const MAX_QUICK_INFO_DOCUMENTATION_CACHE_ENTRIES = 64
const MAX_QUICK_INFO_DISPLAY_TOKEN_CACHE_ENTRIES = 128
const BASE_TOKEN_CLASS_NAME = '\u00d7'
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
  marginBlock: '0.35rem',
  borderRadius: 5,
  boxShadow: 'inset 0 0 0 1px var(--border)',
  overflow: 'hidden',
  backgroundColor: 'rgba(127, 127, 127, 0.08)',
})

const MarkdownCodeBlockToolbar = styled('div', {
  display: 'flex',
  alignItems: 'center',
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
  margin: 0,
  display: 'grid',
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

const quickInfoDisplayTokenCache = new Map<string, Promise<TokenizedLines | null>>()
const quickInfoDocumentationContentCache = new Map<
  string,
  Promise<React.ReactNode>
>()

export function QuickInfoClientPopover({
  diagnostics,
  quickInfo,
  displayTokens,
  theme,
  css,
  className,
  style,
  tokenThemeConfig,
  runtime,
  languages,
}: {
  diagnostics?: TokenDiagnostic[]
  quickInfo?: {
    displayText: string
    documentationText: string
  }
  displayTokens?: TokenizedLines
  theme: QuickInfoTheme
  css?: CSSObject
  className?: string
  style?: React.CSSProperties
  tokenThemeConfig?: ConfigurationOptions['theme']
  runtime?: AnalysisServerRuntime
  languages?: GrammarLanguage[]
}) {
  const { quickInfo: activeQuickInfo } = useQuickInfoContext()
  const displayText = quickInfo?.displayText || ''
  const documentationText = quickInfo?.documentationText || ''
  const [resolvedDisplayTokens, setResolvedDisplayTokens] =
    React.useState<TokenizedLines | null>(null)
  const activeThemeName = React.useMemo(() => {
    return readActiveThemeName(activeQuickInfo?.anchorId)
  }, [activeQuickInfo?.anchorId])

  React.useEffect(() => {
    let isDisposed = false

    if (!displayText || displayTokens) {
      setResolvedDisplayTokens(null)
      return
    }

    setResolvedDisplayTokens(null)
    void getQuickInfoDisplayTokens(
      displayText,
      tokenThemeConfig,
      runtime,
      languages
    ).then(
      (tokens) => {
        if (!isDisposed) {
          setResolvedDisplayTokens(tokens)
        }
      }
    )

    return () => {
      isDisposed = true
    }
  }, [displayText, displayTokens, tokenThemeConfig, runtime, languages])

  const effectiveDisplayTokens = displayTokens ?? resolvedDisplayTokens

  return (
    <QuickInfoContent
      diagnostics={diagnostics}
      display={
        displayText ? (
          <QuickInfoDisplayText>
            {effectiveDisplayTokens
              ? renderTokenizedDisplayText(effectiveDisplayTokens)
              : displayText}
          </QuickInfoDisplayText>
        ) : undefined
      }
      documentation={
        documentationText ? (
          <React.Suspense fallback={null}>
            <QuickInfoDocumentationMarkdown
              documentationText={documentationText}
              theme={theme}
            />
          </React.Suspense>
        ) : undefined
      }
      theme={theme}
      themeName={activeThemeName}
      css={css}
      className={className}
      style={style}
    />
  )
}

export function QuickInfoLoading({
  theme,
  css,
  className,
  style,
}: {
  theme: QuickInfoTheme
  css?: CSSObject
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <QuickInfoContent
      isLoading
      loadingText='loading…'
      theme={theme}
      css={css}
      className={className}
      style={style}
    />
  )
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
    quickInfoDocumentationContentCache.delete(documentationText)
    quickInfoDocumentationContentCache.set(documentationText, cached)
    return cached
  }

  const contentPromise = getMarkdownContent({
    source: documentationText,
    components: {
      CodeBlock: QuickInfoMarkdownCodeBlock,
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
  }).catch(() => {
    return <QuickInfoDocumentationText>{documentationText}</QuickInfoDocumentationText>
  })

  quickInfoDocumentationContentCache.set(documentationText, contentPromise)

  while (
    quickInfoDocumentationContentCache.size >
    MAX_QUICK_INFO_DOCUMENTATION_CACHE_ENTRIES
  ) {
    const oldestKey = quickInfoDocumentationContentCache.keys().next().value
    if (typeof oldestKey !== 'string') {
      break
    }
    quickInfoDocumentationContentCache.delete(oldestKey)
  }

  return contentPromise
}

async function getQuickInfoDisplayTokens(
  displayText: string,
  tokenThemeConfig: ConfigurationOptions['theme'] | undefined,
  runtime: AnalysisServerRuntime | undefined,
  languages: GrammarLanguage[] | undefined
): Promise<TokenizedLines | null> {
  const cacheKey = stableStringify([
    displayText,
    tokenThemeConfig ?? null,
    runtime
      ? {
          id: runtime.id,
          host: runtime.host,
          port: runtime.port,
        }
      : null,
    languages ?? null,
  ])
  const cached = quickInfoDisplayTokenCache.get(cacheKey)
  if (cached) {
    quickInfoDisplayTokenCache.delete(cacheKey)
    quickInfoDisplayTokenCache.set(cacheKey, cached)
    return cached
  }

  const tokensPromise = resolveQuickInfoDisplayTokens(
    displayText,
    tokenThemeConfig,
    runtime,
    languages
  )

  quickInfoDisplayTokenCache.set(cacheKey, tokensPromise)
  while (
    quickInfoDisplayTokenCache.size > MAX_QUICK_INFO_DISPLAY_TOKEN_CACHE_ENTRIES
  ) {
    const oldestKey = quickInfoDisplayTokenCache.keys().next().value
    if (typeof oldestKey !== 'string') {
      break
    }
    quickInfoDisplayTokenCache.delete(oldestKey)
  }

  return tokensPromise
}

async function resolveQuickInfoDisplayTokens(
  displayText: string,
  tokenThemeConfig: ConfigurationOptions['theme'] | undefined,
  runtime: AnalysisServerRuntime | undefined,
  languages: GrammarLanguage[] | undefined
): Promise<TokenizedLines | null> {
  try {
    return await getAnalysisClientTokens({
      value: displayText,
      language: 'typescript',
      languages,
      theme: tokenThemeConfig,
      allowErrors: true,
      waitForWarmResult: true,
      runtime,
    })
  } catch {
    return null
  }
}

function renderTokenizedDisplayText(
  lines: TokenizedLines
): React.ReactNode {
  return lines.map((line, lineIndex) => {
    return (
      <Fragment key={lineIndex}>
        {lineIndex === 0 ? null : '\n'}
        {line.map((token, tokenIndex) => {
          const tokenStyle = token.style as CSSObject
          const usesThemeVariables = hasThemeVariableTokenStyle(tokenStyle)
          const [tokenClassName, Styles] = usesThemeVariables
            ? css(tokenStyle)
            : [undefined, NoopStyles]

          return (
            <Fragment key={tokenIndex}>
              <QuickInfoDisplayToken
                className={
                  usesThemeVariables && tokenClassName
                    ? `${tokenClassName} ${BASE_TOKEN_CLASS_NAME}`
                    : usesThemeVariables
                      ? BASE_TOKEN_CLASS_NAME
                      : undefined
                }
                style={
                  usesThemeVariables
                    ? undefined
                    : (tokenStyle as React.CSSProperties)
                }
              >
                {token.value}
              </QuickInfoDisplayToken>
              <Styles />
            </Fragment>
          )
        })}
      </Fragment>
    )
  })
}

function hasThemeVariableTokenStyle(style: CSSObject): boolean {
  return Object.keys(style).some((key) => key.startsWith('--'))
}

function NoopStyles(): null {
  return null
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

function QuickInfoMarkdownCodeBlock({
  path,
  showLineNumbers = false,
  showToolbar,
  children,
  className,
  style,
}: {
  path?: string
  showLineNumbers?: boolean
  showToolbar?: boolean
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const value = resolveQuickInfoMarkdownCodeValue(children) ?? ''
  const lineCount = Math.max(1, value.split('\n').length)
  const lineNumbers = Array.from({ length: lineCount }, (_, index) => {
    return index + 1
  }).join('\n')
  const shouldRenderToolbar = Boolean(showToolbar === undefined ? path : showToolbar)

  return (
    <MarkdownCodeBlockContainer>
      {shouldRenderToolbar ? (
        <MarkdownCodeBlockToolbar>
          {path ? <MarkdownCodeBlockPath>{path}</MarkdownCodeBlockPath> : null}
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
          css={{
            gridColumn: showLineNumbers ? 2 : 1,
          }}
        >
          {value}
        </MarkdownCodeBlockCode>
      </MarkdownCodeBlockPre>
    </MarkdownCodeBlockContainer>
  )
}

function resolveQuickInfoMarkdownCodeValue(
  children: React.ReactNode
): string | undefined {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children)
  }

  if (Array.isArray(children)) {
    return children.map(resolveQuickInfoMarkdownCodeValue).join('')
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(children)) {
    return resolveQuickInfoMarkdownCodeValue(children.props.children)
  }

  return undefined
}
