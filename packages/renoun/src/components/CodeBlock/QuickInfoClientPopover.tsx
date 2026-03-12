'use client'
import React, { Fragment } from 'react'
import { styled, type CSSObject } from 'restyle'
import { getMarkdownContent } from '@renoun/mdx'
import { rehypePlugins } from '@renoun/mdx/rehype'
import { remarkPlugins } from '@renoun/mdx/remark'
import { Fragment as JsxFragment, jsx, jsxs } from 'react/jsx-runtime'

import {
  getCodeBlockSourceText as getAnalysisClientCodeBlockSourceText,
  getTokens as getAnalysisClientTokens,
} from '../../analysis/browser-client.ts'
import { grammars } from '../../grammars/index.ts'
import type { AnalysisServerRuntime } from '../../analysis/runtime-env.ts'
import type { Languages } from '../../utils/get-language.ts'
import { stableStringify } from '../../utils/stable-serialization.ts'
import type {
  Token,
  TokenDiagnostic,
  TokenizedLines,
} from '../../utils/get-tokens.ts'
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
const MAX_QUICK_INFO_DOCUMENTATION_CACHE_ENTRIES = 64
const MAX_QUICK_INFO_MARKDOWN_CODE_BLOCK_CACHE_ENTRIES = 64
const QUICK_INFO_MARKDOWN_LANGUAGES = new Set<Languages>([
  'plaintext',
  'text',
  'txt',
  ...Object.values(grammars).flat(),
])

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
const quickInfoMarkdownCodeBlockContentCache = new Map<
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
  const {
    isLoading,
    resolvedQuickInfo,
    resolvedDisplayTokens,
    selectedRuntime,
    refreshVersion,
  } = useResolvedQuickInfoClientState({
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
              runtime={selectedRuntime}
              tokenThemeConfig={tokenThemeConfig}
              refreshVersion={refreshVersion}
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
  runtime,
  tokenThemeConfig,
  refreshVersion,
}: {
  documentationText: string
  theme: QuickInfoTheme
  runtime: AnalysisServerRuntime | undefined
  tokenThemeConfig: QuickInfoRequest['themeConfig']
  refreshVersion: string
}) {
  const content = React.use(
    getQuickInfoDocumentationContent({
      documentationText,
      runtime,
      tokenThemeConfig,
      refreshVersion,
    })
  )

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

interface QuickInfoDocumentationContentOptions {
  documentationText: string
  runtime?: AnalysisServerRuntime
  tokenThemeConfig?: QuickInfoRequest['themeConfig']
  refreshVersion?: string
}

function getQuickInfoDocumentationContent(
  options: QuickInfoDocumentationContentOptions | string
): Promise<React.ReactNode> {
  const normalizedOptions =
    normalizeQuickInfoDocumentationContentOptions(options)
  const cacheKey = toQuickInfoDocumentationContentCacheKey(normalizedOptions)
  const cached = readQuickInfoDocumentationContentFromCache(cacheKey)
  if (cached) {
    return cached
  }

  const contentPromise = getMarkdownContent({
    source: normalizedOptions.documentationText,
    components: {
      CodeBlock: (props) => {
        return (
          <QuickInfoMarkdownCodeBlock
            {...props}
            runtime={normalizedOptions.runtime}
            tokenThemeConfig={normalizedOptions.tokenThemeConfig}
            refreshVersion={normalizedOptions.refreshVersion}
          />
        )
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
    if (quickInfoDocumentationContentCache.get(cacheKey) === contentPromise) {
      quickInfoDocumentationContentCache.delete(cacheKey)
    }
    throw error
  })

  setQuickInfoDocumentationContentCache(cacheKey, contentPromise)
  return contentPromise
}

function normalizeQuickInfoDocumentationContentOptions(
  options: QuickInfoDocumentationContentOptions | string
): QuickInfoDocumentationContentOptions {
  if (typeof options === 'string') {
    return {
      documentationText: options,
    }
  }

  return options
}

function toQuickInfoDocumentationContentCacheKey(
  options: QuickInfoDocumentationContentOptions
): string {
  return stableStringify([
    options.documentationText,
    options.runtime
      ? {
          id: options.runtime.id,
          host: options.runtime.host,
          port: options.runtime.port,
        }
      : null,
    options.tokenThemeConfig ?? null,
    options.refreshVersion ?? null,
  ])
}

function readQuickInfoDocumentationContentFromCache(
  cacheKey: string
): Promise<React.ReactNode> | undefined {
  const cached = quickInfoDocumentationContentCache.get(cacheKey)
  if (!cached) {
    return undefined
  }

  quickInfoDocumentationContentCache.delete(cacheKey)
  quickInfoDocumentationContentCache.set(cacheKey, cached)
  return cached
}

function setQuickInfoDocumentationContentCache(
  cacheKey: string,
  contentPromise: Promise<React.ReactNode>
): void {
  quickInfoDocumentationContentCache.delete(cacheKey)
  quickInfoDocumentationContentCache.set(cacheKey, contentPromise)

  // Keep this cache small because rendered markdown trees can be large and are cheap to rebuild.
  while (
    quickInfoDocumentationContentCache.size >
    MAX_QUICK_INFO_DOCUMENTATION_CACHE_ENTRIES
  ) {
    const oldestKey = quickInfoDocumentationContentCache.keys().next().value
    if (typeof oldestKey !== 'string') {
      return
    }

    quickInfoDocumentationContentCache.delete(oldestKey)
  }
}

function QuickInfoMarkdownCodeBlock({
  path,
  baseDirectory,
  language,
  allowCopy,
  showLineNumbers = false,
  showToolbar,
  children,
  className,
  style,
  runtime,
  tokenThemeConfig,
  refreshVersion,
}: {
  path?: string
  baseDirectory?: string
  language?: string
  allowCopy?: boolean | string
  showLineNumbers?: boolean
  showToolbar?: boolean
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
  runtime?: AnalysisServerRuntime
  tokenThemeConfig?: QuickInfoRequest['themeConfig']
  refreshVersion?: string
}) {
  const content = React.use(
    getQuickInfoMarkdownCodeBlockContent({
      path,
      baseDirectory,
      language,
      allowCopy,
      showLineNumbers,
      showToolbar,
      codeValue: resolveQuickInfoMarkdownCodeValue(children),
      className,
      style,
      runtime,
      tokenThemeConfig,
      refreshVersion,
    })
  )

  return content
}

interface QuickInfoMarkdownCodeBlockContentOptions {
  path?: string
  baseDirectory?: string
  language?: string
  allowCopy?: boolean | string
  showLineNumbers?: boolean
  showToolbar?: boolean
  codeValue?: string
  className?: string
  style?: React.CSSProperties
  runtime?: AnalysisServerRuntime
  tokenThemeConfig?: QuickInfoRequest['themeConfig']
  refreshVersion?: string
}

function getQuickInfoMarkdownCodeBlockContent(
  options: QuickInfoMarkdownCodeBlockContentOptions
): Promise<React.ReactNode> {
  const cacheKey = toQuickInfoMarkdownCodeBlockContentCacheKey(options)
  const cached = readQuickInfoMarkdownCodeBlockContentFromCache(cacheKey)
  if (cached) {
    return cached
  }

  const contentPromise = resolveQuickInfoMarkdownCodeBlockContent(
    options
  ).catch((error) => {
    if (
      quickInfoMarkdownCodeBlockContentCache.get(cacheKey) === contentPromise
    ) {
      quickInfoMarkdownCodeBlockContentCache.delete(cacheKey)
    }
    throw error
  })

  setQuickInfoMarkdownCodeBlockContentCache(cacheKey, contentPromise)
  return contentPromise
}

function toQuickInfoMarkdownCodeBlockContentCacheKey(
  options: QuickInfoMarkdownCodeBlockContentOptions
): string {
  return stableStringify([
    options.path ?? null,
    options.baseDirectory ?? null,
    options.language ?? null,
    options.allowCopy ?? null,
    options.showLineNumbers ?? false,
    options.showToolbar ?? null,
    options.codeValue ?? null,
    options.className ?? null,
    options.style ?? null,
    options.runtime
      ? {
          id: options.runtime.id,
          host: options.runtime.host,
          port: options.runtime.port,
        }
      : null,
    options.tokenThemeConfig ?? null,
    options.refreshVersion ?? null,
  ])
}

function readQuickInfoMarkdownCodeBlockContentFromCache(
  cacheKey: string
): Promise<React.ReactNode> | undefined {
  const cached = quickInfoMarkdownCodeBlockContentCache.get(cacheKey)
  if (!cached) {
    return undefined
  }

  quickInfoMarkdownCodeBlockContentCache.delete(cacheKey)
  quickInfoMarkdownCodeBlockContentCache.set(cacheKey, cached)
  return cached
}

function setQuickInfoMarkdownCodeBlockContentCache(
  cacheKey: string,
  contentPromise: Promise<React.ReactNode>
): void {
  quickInfoMarkdownCodeBlockContentCache.delete(cacheKey)
  quickInfoMarkdownCodeBlockContentCache.set(cacheKey, contentPromise)

  while (
    quickInfoMarkdownCodeBlockContentCache.size >
    MAX_QUICK_INFO_MARKDOWN_CODE_BLOCK_CACHE_ENTRIES
  ) {
    const oldestKey = quickInfoMarkdownCodeBlockContentCache.keys().next().value
    if (typeof oldestKey !== 'string') {
      return
    }

    quickInfoMarkdownCodeBlockContentCache.delete(oldestKey)
  }
}

async function resolveQuickInfoMarkdownCodeBlockContent(
  options: QuickInfoMarkdownCodeBlockContentOptions
): Promise<React.ReactNode> {
  const value = await resolveQuickInfoMarkdownCodeSource(options)
  const tokenizedLines = await requestQuickInfoMarkdownCodeTokens({
    value,
    path: options.path,
    language: options.language,
    runtime: options.runtime,
    tokenThemeConfig: options.tokenThemeConfig,
  })
  const shouldRenderToolbar = Boolean(
    options.showToolbar === undefined
      ? options.path || options.allowCopy
      : options.showToolbar
  )
  const copyValue =
    typeof options.allowCopy === 'string' ? options.allowCopy : value
  const shouldRenderCopyButton =
    options.allowCopy !== false &&
    typeof copyValue === 'string' &&
    copyValue.length > 0
  const lineCount = Math.max(1, value.split('\n').length)
  const lineNumbers = Array.from({ length: lineCount }, (_, index) => {
    return index + 1
  }).join('\n')
  const codeClassName =
    options.language && options.language.length > 0
      ? `language-${options.language}`
      : undefined

  return (
    <MarkdownCodeBlockContainer>
      {shouldRenderToolbar ? (
        <MarkdownCodeBlockToolbar>
          {options.path ? (
            <MarkdownCodeBlockPath>{options.path}</MarkdownCodeBlockPath>
          ) : null}
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
        className={options.className}
        style={options.style}
        css={{
          gridTemplateColumns: options.showLineNumbers ? 'auto 1fr' : undefined,
        }}
      >
        {options.showLineNumbers ? (
          <MarkdownCodeBlockLineNumbers>
            {lineNumbers}
          </MarkdownCodeBlockLineNumbers>
        ) : null}
        <MarkdownCodeBlockCode
          className={codeClassName}
          css={{
            gridColumn: options.showLineNumbers ? 2 : 1,
            paddingRight:
              !shouldRenderToolbar && shouldRenderCopyButton
                ? '2rem'
                : undefined,
          }}
        >
          {tokenizedLines
            ? renderQuickInfoMarkdownTokenizedLines(tokenizedLines)
            : value}
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

async function resolveQuickInfoMarkdownCodeSource(
  options: QuickInfoMarkdownCodeBlockContentOptions
): Promise<string> {
  if (typeof options.codeValue === 'string' && options.codeValue.length > 0) {
    return options.codeValue
  }

  if (typeof options.path === 'string' && options.path.length > 0) {
    try {
      return await getAnalysisClientCodeBlockSourceText({
        filePath: options.path,
        baseDirectory: options.baseDirectory,
        runtime: options.runtime,
      })
    } catch {
      return options.codeValue ?? ''
    }
  }

  return options.codeValue ?? ''
}

function resolveQuickInfoMarkdownCodeLanguage(
  language: string | undefined
): Languages | undefined {
  if (typeof language !== 'string' || language.length === 0) {
    return undefined
  }

  const normalizedLanguage = language
    .trim()
    .replace(/^[{(]+/, '')
    .replace(/[})]+$/, '')
    .replace(/^\./, '')
    .replace(/^language-/, '')
    .replace(/[,:;]+$/, '')
    .trim()
    .toLowerCase()

  if (normalizedLanguage.length === 0) {
    return undefined
  }

  if (QUICK_INFO_MARKDOWN_LANGUAGES.has(normalizedLanguage as Languages)) {
    return normalizedLanguage as Languages
  }

  return undefined
}

async function requestQuickInfoMarkdownCodeTokens(options: {
  value: string
  path?: string
  language?: string
  runtime?: AnalysisServerRuntime
  tokenThemeConfig?: QuickInfoRequest['themeConfig']
}): Promise<TokenizedLines | null> {
  if (options.value.length === 0) {
    return null
  }

  const language = resolveQuickInfoMarkdownCodeLanguage(options.language)

  try {
    return await getAnalysisClientTokens({
      value: options.value,
      filePath: options.path,
      language,
      theme: options.tokenThemeConfig,
      waitForWarmResult: true,
      runtime: options.runtime,
    })
  } catch {
    return null
  }
}

function renderQuickInfoMarkdownTokenizedLines(
  lines: TokenizedLines
): React.ReactNode {
  return lines.map((line, lineIndex) => {
    return (
      <Fragment key={lineIndex}>
        {lineIndex === 0 ? null : '\n'}
        {line.map((token, tokenIndex) => {
          return renderQuickInfoMarkdownToken(
            token,
            `${lineIndex}-${tokenIndex}`
          )
        })}
      </Fragment>
    )
  })
}

function renderQuickInfoMarkdownToken(
  token: Token,
  key: string
): React.ReactNode {
  if (
    token.isWhiteSpace ||
    (!token.hasTextStyles && token.isBaseColor && !token.isDeprecated)
  ) {
    return token.value
  }

  const style = resolveQuickInfoMarkdownTokenStyle(token)
  if (!style) {
    return token.value
  }

  return (
    <span key={key} style={style}>
      {token.value}
    </span>
  )
}

function resolveQuickInfoMarkdownTokenStyle(
  token: Token
): React.CSSProperties | undefined {
  const resolvedStyle = resolveDisplayTokenStyle(token.style)

  if (token.isDeprecated && resolvedStyle.textDecoration === undefined) {
    resolvedStyle.textDecoration = 'line-through'
  }

  return Object.keys(resolvedStyle).length > 0 ? resolvedStyle : undefined
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
  getQuickInfoDocumentationContentCacheSize: () =>
    quickInfoDocumentationContentCache.size,
  hasQuickInfoDocumentationContent: (documentationText: string) =>
    quickInfoDocumentationContentCache.has(
      toQuickInfoDocumentationContentCacheKey({
        documentationText,
      })
    ),
  clearQuickInfoDocumentationContentCache: () => {
    quickInfoDocumentationContentCache.clear()
    quickInfoMarkdownCodeBlockContentCache.clear()
  },
  MAX_QUICK_INFO_DOCUMENTATION_CACHE_ENTRIES,
}
