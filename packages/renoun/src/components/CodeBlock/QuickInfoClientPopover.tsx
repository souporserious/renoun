'use client'
import React, { Fragment } from 'react'
import { styled, type CSSObject } from 'restyle'

import type { TokenDiagnostic } from '../../utils/get-tokens.ts'
import type { ProjectServerRuntime } from '../../project/runtime-env.ts'
import { resolveBrowserWebSocketUrl } from '../../project/rpc/browser-websocket-url.ts'
import type { ConfigurationOptions } from '../Config/types.ts'
import { QuickInfoPopover } from './QuickInfoPopover.tsx'
import { useQuickInfoContext } from './QuickInfoProvider.tsx'

interface QuickInfoData {
  displayText: string
  documentationText: string
}

interface QuickInfoTheme {
  border?: string
  background: string
  foreground: string
  panelBorder: string
  errorForeground: string
}

interface QuickInfoRequest {
  filePath: string
  position: number
  projectVersion?: string
  runtime: ProjectServerRuntime
  themeConfig?: ConfigurationOptions['theme']
}

interface QuickInfoCacheEntry {
  value: QuickInfoData | null
  expiresAt: number
}

interface QuickInfoTokenizedDisplayToken {
  value: string
  style: Record<string, string>
}

type QuickInfoTokenizedDisplayText = QuickInfoTokenizedDisplayToken[][]

interface QuickInfoDisplayTokensCacheEntry {
  value: QuickInfoTokenizedDisplayText | null
  expiresAt: number
}

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
const QUICK_INFO_REQUEST_TIMEOUT_MS = 12_000
const QUICK_INFO_CACHE_MAX_ENTRIES = 1_000
const QUICK_INFO_CACHE_TTL_MS =
  process.env.NODE_ENV === 'development' ? 15_000 : 5 * 60_000
const QUICK_INFO_DISPLAY_TOKENS_CACHE_VERSION = 'v2'
const QUICK_INFO_TEST_IDS_ENABLED = process.env.NODE_ENV === 'test'

const quickInfoCacheByKey = new Map<string, QuickInfoCacheEntry>()
const quickInfoInFlightByKey = new Map<string, Promise<QuickInfoData | null>>()
const quickInfoDisplayTokensCacheByKey = new Map<
  string,
  QuickInfoDisplayTokensCacheEntry
>()
const quickInfoDisplayTokensInFlightByKey = new Map<
  string,
  Promise<QuickInfoTokenizedDisplayText | null>
>()
let nextQuickInfoRequestId = 1
let quickInfoFetchQueue: Promise<void> = Promise.resolve()

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
  const [resolvedQuickInfo, setResolvedQuickInfo] =
    React.useState<QuickInfoData | null>(
      quickInfo === undefined ? null : quickInfo
    )
  const [resolvedDisplayTokens, setResolvedDisplayTokens] =
    React.useState<QuickInfoTokenizedDisplayText | null>(null)
  const [isLoading, setIsLoading] = React.useState<boolean>(
    quickInfo === undefined && request !== undefined
  )
  const { quickInfo: activeQuickInfo } = useQuickInfoContext()
  const activeThemeName = React.useMemo(() => {
    return readActiveThemeName(activeQuickInfo?.anchorId)
  }, [activeQuickInfo?.anchorId])
  const requestKey = request ? toQuickInfoCacheKey(request) : ''
  const requestThemeKey = request
    ? toQuickInfoThemeCacheKey(request.themeConfig)
    : ''
  const resolvedTokenThemeConfig = React.useMemo(() => {
    return resolveQuickInfoTokenThemeConfig(request?.themeConfig, activeThemeName)
  }, [activeThemeName, requestThemeKey])
  const resolvedTokenThemeCacheKey = React.useMemo(() => {
    return toQuickInfoThemeCacheKey(resolvedTokenThemeConfig)
  }, [resolvedTokenThemeConfig])

  React.useEffect(() => {
    let isDisposed = false

    if (quickInfo !== undefined) {
      setResolvedQuickInfo(quickInfo)
      setIsLoading(false)
      return
    }

    if (!request) {
      setResolvedQuickInfo(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    void getQuickInfoForRequest(request).then((value) => {
      if (isDisposed) {
        return
      }

      setResolvedQuickInfo(value)
      setIsLoading(false)
    })

    return () => {
      isDisposed = true
    }
  }, [quickInfo, requestKey])

  React.useEffect(() => {
    let isDisposed = false

    if (!request || !resolvedQuickInfo?.displayText) {
      setResolvedDisplayTokens(null)
      return
    }

    const displayText = resolvedQuickInfo.displayText
    setResolvedDisplayTokens(null)
    void getQuickInfoDisplayTokensForRequest(
      request,
      displayText,
      resolvedTokenThemeConfig,
      resolvedTokenThemeCacheKey
    ).then((value) => {
      if (isDisposed) {
        return
      }

      setResolvedDisplayTokens(value)
    })

    return () => {
      isDisposed = true
    }
  }, [
    requestKey,
    requestThemeKey,
    resolvedQuickInfo?.displayText,
    resolvedTokenThemeConfig,
    resolvedTokenThemeCacheKey,
  ])

  const displayText = resolvedQuickInfo?.displayText || ''
  const documentationText = resolvedQuickInfo?.documentationText || ''

  return (
    <QuickInfoPopover>
      <Container
        css={{
          boxSizing: 'border-box',
          border: theme.border ? `1px solid ${theme.border}` : undefined,
          backgroundColor: theme.background,
          color: theme.foreground,
          ...css,
        }}
        className={className}
        style={style}
      >
        <ContentContainer data-testid={getQuickInfoTestId('content')}>
          {diagnostics?.length ? (
            <DiagnosticContainer>
              {diagnostics.map((diagnostic, index) => (
                <Diagnostic key={index} style={{ color: theme.errorForeground }}>
                  {diagnostic.message}
                  <DiagnosticCode>({diagnostic.code})</DiagnosticCode>
                </Diagnostic>
              ))}
            </DiagnosticContainer>
          ) : null}

          {isLoading ? (
            <>
              {diagnostics?.length ? (
                <Divider
                  color={theme.panelBorder}
                  data-testid={getQuickInfoTestId('divider')}
                />
              ) : null}
              <LoadingText>Loading symbol info...</LoadingText>
            </>
          ) : null}

          {!isLoading && displayText ? (
            <>
              {diagnostics?.length ? (
                <Divider
                  color={theme.panelBorder}
                  data-testid={getQuickInfoTestId('divider')}
                />
              ) : null}
              <DisplayTextContainer data-testid={getQuickInfoTestId('display')}>
                {resolvedDisplayTokens
                  ? renderTokenizedDisplayText(resolvedDisplayTokens)
                  : renderHighlightedDisplayText(displayText)}
              </DisplayTextContainer>
            </>
          ) : null}

          {!isLoading && documentationText.length ? (
            <>
              <Divider
                color={theme.panelBorder}
                data-testid={getQuickInfoTestId('divider')}
              />
              <DocumentationText>{documentationText}</DocumentationText>
            </>
          ) : null}
        </ContentContainer>
      </Container>
    </QuickInfoPopover>
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
            <DisplayToken key={tokenIndex} style={resolveDisplayTokenStyle(token.style)}>
              {token.value}
            </DisplayToken>
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

async function getQuickInfoForRequest(
  request: QuickInfoRequest
): Promise<QuickInfoData | null> {
  const cacheKey = toQuickInfoCacheKey(request)
  const cached = readQuickInfoCache(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const inFlight = quickInfoInFlightByKey.get(cacheKey)
  if (inFlight) {
    return inFlight
  }

  const requestPromise = runQuickInfoFetchTask(async () =>
    requestQuickInfoOverWebSocket(request)
  )
    .then((value) => {
      writeQuickInfoCache(cacheKey, value)
      return value
    })
    .finally(() => {
      const current = quickInfoInFlightByKey.get(cacheKey)
      if (current === requestPromise) {
        quickInfoInFlightByKey.delete(cacheKey)
      }
    })

  quickInfoInFlightByKey.set(cacheKey, requestPromise)
  return requestPromise
}

async function getQuickInfoDisplayTokensForRequest(
  request: QuickInfoRequest,
  displayText: string,
  tokenThemeConfig: ConfigurationOptions['theme'] | undefined,
  tokenThemeCacheKey: string
): Promise<QuickInfoTokenizedDisplayText | null> {
  if (!displayText) {
    return null
  }

  const cacheKey = toQuickInfoDisplayTokensCacheKey(
    request,
    tokenThemeCacheKey,
    displayText
  )
  const cached = readQuickInfoDisplayTokensCache(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const inFlight = quickInfoDisplayTokensInFlightByKey.get(cacheKey)
  if (inFlight) {
    return inFlight
  }

  const requestPromise = runQuickInfoFetchTask(async () =>
    requestDisplayTokensOverWebSocket(request, displayText, tokenThemeConfig)
  )
    .then((value) => {
      writeQuickInfoDisplayTokensCache(cacheKey, value)
      return value
    })
    .finally(() => {
      const current = quickInfoDisplayTokensInFlightByKey.get(cacheKey)
      if (current === requestPromise) {
        quickInfoDisplayTokensInFlightByKey.delete(cacheKey)
      }
    })

  quickInfoDisplayTokensInFlightByKey.set(cacheKey, requestPromise)
  return requestPromise
}

function runQuickInfoFetchTask<T>(task: () => Promise<T>): Promise<T> {
  const run = quickInfoFetchQueue.then(task, task)
  quickInfoFetchQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function toQuickInfoCacheKey(request: QuickInfoRequest): string {
  const projectVersion = request.projectVersion ?? request.runtime.id
  return `${projectVersion}:${request.filePath}:${request.position}`
}

function toQuickInfoThemeCacheKey(
  themeConfig: ConfigurationOptions['theme'] | undefined
): string {
  if (themeConfig === undefined) {
    return 'default'
  }

  try {
    return JSON.stringify(themeConfig)
  } catch {
    return 'default'
  }
}

function resolveQuickInfoTokenThemeConfig(
  themeConfig: ConfigurationOptions['theme'] | undefined,
  activeThemeName: string | undefined
): ConfigurationOptions['theme'] | undefined {
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

function toQuickInfoDisplayTokensCacheKey(
  request: QuickInfoRequest,
  tokenThemeCacheKey: string,
  displayText: string
): string {
  return `${QUICK_INFO_DISPLAY_TOKENS_CACHE_VERSION}:${toQuickInfoCacheKey(
    request
  )}:${tokenThemeCacheKey}:${displayText}`
}

function readQuickInfoCache(
  cacheKey: string
): QuickInfoData | null | undefined {
  const entry = quickInfoCacheByKey.get(cacheKey)
  if (!entry) {
    return undefined
  }

  if (entry.expiresAt <= Date.now()) {
    quickInfoCacheByKey.delete(cacheKey)
    return undefined
  }

  quickInfoCacheByKey.delete(cacheKey)
  quickInfoCacheByKey.set(cacheKey, entry)
  return entry.value
}

function writeQuickInfoCache(cacheKey: string, value: QuickInfoData | null): void {
  quickInfoCacheByKey.set(cacheKey, {
    value,
    expiresAt: Date.now() + QUICK_INFO_CACHE_TTL_MS,
  })

  while (quickInfoCacheByKey.size > QUICK_INFO_CACHE_MAX_ENTRIES) {
    const oldest = quickInfoCacheByKey.keys().next().value
    if (typeof oldest !== 'string') {
      break
    }

    quickInfoCacheByKey.delete(oldest)
  }
}

function readQuickInfoDisplayTokensCache(
  cacheKey: string
): QuickInfoTokenizedDisplayText | null | undefined {
  const entry = quickInfoDisplayTokensCacheByKey.get(cacheKey)
  if (!entry) {
    return undefined
  }

  if (entry.expiresAt <= Date.now()) {
    quickInfoDisplayTokensCacheByKey.delete(cacheKey)
    return undefined
  }

  quickInfoDisplayTokensCacheByKey.delete(cacheKey)
  quickInfoDisplayTokensCacheByKey.set(cacheKey, entry)
  return entry.value
}

function writeQuickInfoDisplayTokensCache(
  cacheKey: string,
  value: QuickInfoTokenizedDisplayText | null
): void {
  quickInfoDisplayTokensCacheByKey.set(cacheKey, {
    value,
    expiresAt: Date.now() + QUICK_INFO_CACHE_TTL_MS,
  })

  while (quickInfoDisplayTokensCacheByKey.size > QUICK_INFO_CACHE_MAX_ENTRIES) {
    const oldest = quickInfoDisplayTokensCacheByKey.keys().next().value
    if (typeof oldest !== 'string') {
      break
    }

    quickInfoDisplayTokensCacheByKey.delete(oldest)
  }
}

function normalizeQuickInfoResult(value: unknown): QuickInfoData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as {
    displayText?: unknown
    documentationText?: unknown
  }
  if (typeof candidate.displayText !== 'string') {
    return null
  }

  return {
    displayText: candidate.displayText,
    documentationText:
      typeof candidate.documentationText === 'string'
        ? candidate.documentationText
        : '',
  }
}

function normalizeQuickInfoTokenizedDisplayText(
  value: unknown
): QuickInfoTokenizedDisplayText | null {
  if (!Array.isArray(value)) {
    return null
  }

  const normalizedLines: QuickInfoTokenizedDisplayText = []
  for (const line of value) {
    if (!Array.isArray(line)) {
      continue
    }

    const normalizedTokens: QuickInfoTokenizedDisplayToken[] = []
    for (const tokenValue of line) {
      if (
        !tokenValue ||
        typeof tokenValue !== 'object' ||
        Array.isArray(tokenValue)
      ) {
        continue
      }

      const candidate = tokenValue as {
        value?: unknown
        style?: unknown
      }
      if (typeof candidate.value !== 'string') {
        continue
      }

      const style =
        candidate.style &&
        typeof candidate.style === 'object' &&
        !Array.isArray(candidate.style)
          ? normalizeQuickInfoTokenStyle(candidate.style)
          : {}

      normalizedTokens.push({
        value: candidate.value,
        style,
      })
    }

    normalizedLines.push(normalizedTokens)
  }

  return normalizedLines.length > 0 ? normalizedLines : null
}

function normalizeQuickInfoTokenStyle(style: unknown): Record<string, string> {
  if (!style || typeof style !== 'object' || Array.isArray(style)) {
    return {}
  }

  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(style)) {
    if (typeof value !== 'string') {
      continue
    }

    if (
      key === 'color' ||
      key === 'fontStyle' ||
      key === 'fontWeight' ||
      key === 'textDecoration' ||
      key.startsWith('--')
    ) {
      normalized[key] = value
    }
  }

  return normalized
}

function readRpcResponseForRequest(
  payload: unknown,
  requestId: number
):
  | {
      result?: unknown
      error?: unknown
    }
  | undefined {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const response = readRpcResponseForRequest(item, requestId)
      if (response) {
        return response
      }
    }

    return undefined
  }

  if (!payload || typeof payload !== 'object') {
    return undefined
  }

  const candidate = payload as {
    id?: unknown
    result?: unknown
    error?: unknown
  }

  if (candidate.id !== requestId) {
    return undefined
  }

  return {
    result: candidate.result,
    error: candidate.error,
  }
}

async function requestQuickInfoOverWebSocket(
  request: QuickInfoRequest
): Promise<QuickInfoData | null> {
  return requestRpcMethodOverWebSocket(
    request,
    'getQuickInfoAtPosition',
    {
      filePath: request.filePath,
      position: request.position,
    },
    normalizeQuickInfoResult
  )
}

async function requestDisplayTokensOverWebSocket(
  request: QuickInfoRequest,
  value: string,
  tokenThemeConfig: ConfigurationOptions['theme'] | undefined
): Promise<QuickInfoTokenizedDisplayText | null> {
  return requestRpcMethodOverWebSocket(
    request,
    'getTokens',
    {
      value,
      language: 'typescript',
      theme: tokenThemeConfig,
      allowErrors: true,
      waitForWarmResult: true,
    },
    normalizeQuickInfoTokenizedDisplayText
  )
}

async function requestRpcMethodOverWebSocket<Result>(
  request: QuickInfoRequest,
  method: string,
  params: Record<string, unknown>,
  normalizeResult: (value: unknown) => Result | null
): Promise<Result | null> {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return null
  }

  return new Promise((resolve) => {
    const requestId = nextQuickInfoRequestId++
    const url = resolveBrowserWebSocketUrl(request.runtime.port)
    const socket = new WebSocket(url, request.runtime.id)
    let settled = false

    const finalize = (value: Result | null) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeoutId)
      try {
        socket.close()
      } catch {
        // Ignore close failures.
      }
      resolve(value)
    }

    const timeoutId = window.setTimeout(() => {
      finalize(null)
    }, QUICK_INFO_REQUEST_TIMEOUT_MS)

    socket.addEventListener('open', () => {
      try {
        socket.send(
          JSON.stringify({
            id: requestId,
            method,
            params,
          })
        )
      } catch {
        finalize(null)
      }
    })

    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        return
      }

      try {
        const payload = JSON.parse(event.data)
        const response = readRpcResponseForRequest(payload, requestId)
        if (!response) {
          return
        }

        if (response.error) {
          finalize(null)
          return
        }

        finalize(normalizeResult(response.result))
      } catch {
        // Ignore malformed messages and continue waiting.
      }
    })

    socket.addEventListener('error', () => {
      finalize(null)
    })

    socket.addEventListener('close', () => {
      finalize(null)
    })
  })
}

const Container = styled('div', {
  fontSize: '1rem',
  position: 'absolute',
  zIndex: 1000,
  maxWidth: 'min(46rem, calc(100vw - 2rem))',
  width: 'max-content',
  borderRadius: 5,
  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
  overflow: 'auto',
  overscrollBehavior: 'contain',
})

const ContentContainer = styled('div', {
  display: 'grid',
  gap: 0,
  padding: 0,
})

const DiagnosticContainer = styled('div', {
  display: 'grid',
  gap: '0.25rem',
  padding: '0.35rem 0.5rem',
})

const Diagnostic = styled('p', {
  margin: 0,
  whiteSpace: 'pre-wrap',
  fontSize: '0.825rem',
  lineHeight: 1.35,
})

const DiagnosticCode = styled('span', {
  opacity: 0.7,
})

const Divider = styled('div', ({ color }: { color: string }) => ({
  height: 1,
  opacity: 0.65,
  backgroundColor: color,
}))

const LoadingText = styled('div', {
  margin: 0,
  padding: '0.35rem 0.5rem',
  fontSize: '0.8rem',
  lineHeight: 1.3,
  opacity: 0.85,
})

const DisplayTextContainer = styled('pre', {
  margin: 0,
  padding: '0.35rem 0.5rem',
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  lineHeight: 1.35,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
})

const DisplayToken = styled('span')

const DocumentationText = styled('div', {
  margin: 0,
  padding: '0.35rem 0.5rem',
  fontSize: '0.825rem',
  lineHeight: 1.4,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
})

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
