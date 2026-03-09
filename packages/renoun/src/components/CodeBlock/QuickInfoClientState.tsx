'use client'
import React from 'react'
import { styled } from 'restyle'
import { getMarkdownContent } from '@renoun/mdx'
import { rehypePlugins } from '@renoun/mdx/rehype'
import { remarkPlugins } from '@renoun/mdx/remark'
import { Fragment as JsxRuntimeFragment, jsx, jsxs } from 'react/jsx-runtime'

import {
  getProjectClientBrowserRefreshVersion,
  getProjectClientBrowserRuntime,
  getProjectServerRuntimeKey,
  onProjectClientBrowserRefreshVersionChange,
  onProjectClientBrowserRuntimeChange,
} from '../../project/browser-runtime.ts'
import {
  getQuickInfoAtPosition as getProjectClientQuickInfoAtPosition,
  getTokens as getProjectClientTokens,
} from '../../project/browser-client.ts'
import { hasRetainedProjectClientBrowserRuntime } from '../../project/browser-client-sync.ts'
import type { ProjectServerRuntime } from '../../project/runtime-env.ts'
import { createConcurrentQueue } from '../../utils/concurrency.ts'
import type { ConfigurationOptions } from '../Config/types.ts'

export interface QuickInfoData {
  displayText: string
  documentationText: string
}

export interface QuickInfoRequest {
  filePath: string
  position: number
  projectVersion?: string
  valueSignature?: string
  cacheDisabled?: boolean
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

export type QuickInfoTokenizedDisplayText = QuickInfoTokenizedDisplayToken[][]

interface QuickInfoDisplayTokensCacheEntry {
  value: QuickInfoTokenizedDisplayText | null
  expiresAt: number
}

interface QuickInfoDocumentationCacheEntry {
  value: React.ReactNode | string
  expiresAt: number
}

interface UseResolvedQuickInfoClientStateOptions {
  anchorId?: string
  quickInfo?: QuickInfoData
  request?: QuickInfoRequest
}

export interface ResolvedQuickInfoClientState {
  isLoading: boolean
  resolvedQuickInfo: QuickInfoData | null
  resolvedDisplayTokens: QuickInfoTokenizedDisplayText | null
  resolvedDocumentationContent: React.ReactNode | string | null
}

export interface QuickInfoRuntimeSelection {
  runtime: ProjectServerRuntime | undefined
  usesSharedBrowserRuntime: boolean
}

const QUICK_INFO_FETCH_CONCURRENCY = 4
const QUICK_INFO_CACHE_MAX_ENTRIES = 1_000
const QUICK_INFO_CACHE_TTL_MS =
  process.env.NODE_ENV === 'development' ? 15_000 : 5 * 60_000
const QUICK_INFO_DISPLAY_TOKENS_CACHE_VERSION = 'v2'
const QUICK_INFO_DOCUMENTATION_CACHE_VERSION = 'v1'

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
const quickInfoDocumentationCacheByKey = new Map<
  string,
  QuickInfoDocumentationCacheEntry
>()
const quickInfoDocumentationInFlightByKey = new Map<
  string,
  Promise<React.ReactNode | string>
>()
const quickInfoFetchQueue = createConcurrentQueue(QUICK_INFO_FETCH_CONCURRENCY)

function useActiveProjectServerRuntime(
  initialRuntime: ProjectServerRuntime | undefined
): QuickInfoRuntimeSelection {
  const mountStrategyRef = React.useRef<{
    runtimeKey: string | undefined
    hasRetainedBrowserRuntime: boolean
  } | null>(null)
  const initialRuntimeKey = getProjectServerRuntimeKey(initialRuntime)
  if (
    mountStrategyRef.current === null ||
    mountStrategyRef.current.runtimeKey !== initialRuntimeKey
  ) {
    mountStrategyRef.current = {
      runtimeKey: initialRuntimeKey,
      hasRetainedBrowserRuntime: hasRetainedProjectClientBrowserRuntime(),
    }
  }
  const hasRetainedBrowserRuntime =
    mountStrategyRef.current.hasRetainedBrowserRuntime
  const browserRuntime = React.useSyncExternalStore(
    onProjectClientBrowserRuntimeChange,
    getProjectClientBrowserRuntime,
    () => initialRuntime
  )

  return resolveQuickInfoRuntimeSelection(
    initialRuntime,
    browserRuntime,
    hasRetainedBrowserRuntime
  )
}

function useProjectClientRefreshVersionSnapshot(): string {
  return React.useSyncExternalStore(
    onProjectClientBrowserRefreshVersionChange,
    getProjectClientBrowserRefreshVersion,
    getProjectClientBrowserRefreshVersion
  )
}

function useActiveThemeName(anchorId: string | undefined): string | undefined {
  return React.useSyncExternalStore(
    subscribeToQuickInfoThemeChanges,
    () => readActiveThemeName(anchorId),
    () => readActiveThemeName(anchorId)
  )
}

export function resolveQuickInfoRuntimeSelection(
  initialRuntime: ProjectServerRuntime | undefined,
  browserRuntime: ProjectServerRuntime | undefined,
  hasRetainedBrowserRuntime: boolean
): QuickInfoRuntimeSelection {
  if (initialRuntime && hasRetainedBrowserRuntime) {
    const initialRuntimeKey = getProjectServerRuntimeKey(initialRuntime)
    const browserRuntimeKey = getProjectServerRuntimeKey(browserRuntime)
    return {
      runtime: initialRuntime,
      usesSharedBrowserRuntime:
        initialRuntimeKey !== undefined &&
        browserRuntimeKey !== undefined &&
        initialRuntimeKey === browserRuntimeKey,
    }
  }

  if (browserRuntime) {
    return {
      runtime: browserRuntime,
      usesSharedBrowserRuntime: true,
    }
  }

  return {
    runtime: initialRuntime,
    usesSharedBrowserRuntime: !hasRetainedBrowserRuntime,
  }
}

export function resolveQuickInfoProjectVersion(options: {
  browserRuntime: ProjectServerRuntime | undefined
  selectedRuntime: ProjectServerRuntime | undefined
  requestProjectVersion: string | undefined
  refreshVersion: string
}): string | undefined {
  const {
    browserRuntime,
    selectedRuntime,
    requestProjectVersion,
    refreshVersion,
  } = options

  if (!selectedRuntime) {
    return requestProjectVersion
  }

  if (!browserRuntime) {
    if (
      refreshVersion === '0:0' &&
      typeof requestProjectVersion === 'string' &&
      requestProjectVersion.length > 0
    ) {
      return requestProjectVersion
    }

    return `${selectedRuntime.id}:${refreshVersion}`
  }

  if (!areProjectServerRuntimesEqual(browserRuntime, selectedRuntime)) {
    return requestProjectVersion
  }

  if (
    refreshVersion === '0:0' &&
    typeof requestProjectVersion === 'string' &&
    requestProjectVersion.length > 0
  ) {
    return requestProjectVersion
  }

  return `${selectedRuntime.id}:${refreshVersion}`
}

export function useResolvedQuickInfoClientState({
  anchorId,
  quickInfo,
  request,
}: UseResolvedQuickInfoClientStateOptions): ResolvedQuickInfoClientState {
  const [resolvedQuickInfo, setResolvedQuickInfo] =
    React.useState<QuickInfoData | null>(
      quickInfo === undefined ? null : quickInfo
    )
  const [resolvedDisplayTokens, setResolvedDisplayTokens] =
    React.useState<QuickInfoTokenizedDisplayText | null>(null)
  const [isLoading, setIsLoading] = React.useState<boolean>(
    quickInfo === undefined && request !== undefined
  )
  const { runtime: activeRuntime } = useActiveProjectServerRuntime(
    request?.runtime
  )
  const browserRuntime = React.useSyncExternalStore(
    onProjectClientBrowserRuntimeChange,
    getProjectClientBrowserRuntime,
    () => request?.runtime
  )
  const refreshVersion = useProjectClientRefreshVersionSnapshot()
  const activeThemeName = useActiveThemeName(anchorId)
  const effectiveProjectVersion = React.useMemo(() => {
    return resolveQuickInfoProjectVersion({
      browserRuntime,
      selectedRuntime: activeRuntime,
      requestProjectVersion: request?.projectVersion,
      refreshVersion,
    })
  }, [activeRuntime, browserRuntime, refreshVersion, request?.projectVersion])
  const effectiveRequest = React.useMemo(() => {
    if (!request || !activeRuntime) {
      return undefined
    }

    return {
      ...request,
      runtime: activeRuntime,
      projectVersion: effectiveProjectVersion,
    } satisfies QuickInfoRequest
  }, [activeRuntime, effectiveProjectVersion, request])
  const requestKey = effectiveRequest ? toQuickInfoCacheKey(effectiveRequest) : ''
  const requestThemeKey = effectiveRequest
    ? toQuickInfoThemeCacheKey(effectiveRequest.themeConfig)
    : ''
  const resolvedTokenThemeConfig = React.useMemo(() => {
    return resolveQuickInfoTokenThemeConfig(
      effectiveRequest?.themeConfig,
      activeThemeName
    )
  }, [activeThemeName, requestThemeKey])
  const resolvedTokenThemeCacheKey = React.useMemo(() => {
    return toQuickInfoThemeCacheKey(resolvedTokenThemeConfig)
  }, [resolvedTokenThemeConfig])
  const documentationText = resolvedQuickInfo?.documentationText || ''
  const documentationCacheKey = documentationText
    ? toQuickInfoDocumentationCacheKey(documentationText)
    : ''
  const [resolvedDocumentationContent, setResolvedDocumentationContent] =
    React.useState<React.ReactNode | string | null>(() => {
      if (!documentationCacheKey) {
        return null
      }

      return readQuickInfoDocumentationCache(documentationCacheKey) ?? null
    })

  React.useEffect(() => {
    let isDisposed = false

    if (quickInfo !== undefined) {
      setResolvedQuickInfo(quickInfo)
      setIsLoading(false)
      return
    }

    if (!effectiveRequest) {
      setResolvedQuickInfo(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    void getQuickInfoForRequest(effectiveRequest).then((value) => {
      if (isDisposed) {
        return
      }

      setResolvedQuickInfo(value)
      setIsLoading(false)
    })

    return () => {
      isDisposed = true
    }
  }, [effectiveRequest, quickInfo, requestKey])

  React.useEffect(() => {
    let isDisposed = false

    if (!effectiveRequest || !resolvedQuickInfo?.displayText) {
      setResolvedDisplayTokens(null)
      return
    }

    const displayText = resolvedQuickInfo.displayText
    setResolvedDisplayTokens(null)
    void getQuickInfoDisplayTokensForRequest(
      effectiveRequest,
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
    effectiveRequest,
    requestKey,
    requestThemeKey,
    resolvedQuickInfo?.displayText,
    resolvedTokenThemeConfig,
    resolvedTokenThemeCacheKey,
  ])

  React.useEffect(() => {
    let isDisposed = false

    if (!documentationText || !documentationCacheKey) {
      setResolvedDocumentationContent(null)
      return
    }

    const cachedDocumentation =
      readQuickInfoDocumentationCache(documentationCacheKey)
    if (cachedDocumentation !== undefined) {
      setResolvedDocumentationContent(cachedDocumentation)
      return
    }

    setResolvedDocumentationContent(null)
    void getQuickInfoDocumentationContent(documentationText).then((value) => {
      if (isDisposed) {
        return
      }

      setResolvedDocumentationContent(value)
    })

    return () => {
      isDisposed = true
    }
  }, [documentationCacheKey, documentationText])

  return {
    isLoading,
    resolvedQuickInfo,
    resolvedDisplayTokens,
    resolvedDocumentationContent,
  }
}

export async function getQuickInfoForRequest(
  request: QuickInfoRequest
): Promise<QuickInfoData | null> {
  const cacheKey = toQuickInfoCacheKey(request)
  const shouldBypassCache = request.cacheDisabled === true

  if (!shouldBypassCache) {
    const cached = readQuickInfoCache(cacheKey)
    if (cached !== undefined) {
      return cached
    }
  }

  const inFlight = quickInfoInFlightByKey.get(cacheKey)
  if (inFlight) {
    return inFlight
  }

  const requestPromise = runQuickInfoFetchTask(async () =>
    requestQuickInfo(request)
  )
    .then((value) => {
      if (value !== null && !shouldBypassCache) {
        writeQuickInfoCache(cacheKey, value)
      }
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
    requestDisplayTokens(request, displayText, tokenThemeConfig)
  )
    .then((value) => {
      if (value !== null) {
        writeQuickInfoDisplayTokensCache(cacheKey, value)
      }
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

async function getQuickInfoDocumentationContent(
  documentationText: string
): Promise<React.ReactNode | string> {
  const cacheKey = toQuickInfoDocumentationCacheKey(documentationText)
  const cached = readQuickInfoDocumentationCache(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const inFlight = quickInfoDocumentationInFlightByKey.get(cacheKey)
  if (inFlight) {
    return inFlight
  }

  const requestPromise = renderQuickInfoDocumentationContent(documentationText)
    .then((value) => {
      writeQuickInfoDocumentationCache(cacheKey, value)
      return value
    })
    .catch(() => documentationText)
    .finally(() => {
      const current = quickInfoDocumentationInFlightByKey.get(cacheKey)
      if (current === requestPromise) {
        quickInfoDocumentationInFlightByKey.delete(cacheKey)
      }
    })

  quickInfoDocumentationInFlightByKey.set(cacheKey, requestPromise)
  return requestPromise
}

function runQuickInfoFetchTask<T>(task: () => Promise<T>): Promise<T> {
  return quickInfoFetchQueue.run(task)
}

function hashQuickInfoDisplayText(displayText: string): string {
  let hash = 2166136261
  for (let index = 0; index < displayText.length; index += 1) {
    hash ^= displayText.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function areProjectServerRuntimesEqual(
  left: ProjectServerRuntime | undefined,
  right: ProjectServerRuntime | undefined
): boolean {
  if (!left || !right) {
    return false
  }

  return (
    left.id === right.id &&
    left.port === right.port &&
    left.host === right.host
  )
}

function toQuickInfoCacheKey(request: QuickInfoRequest): string {
  const projectVersion = request.projectVersion ?? request.runtime.id
  const valueSignature = request.valueSignature ?? ''
  return `${projectVersion}:${valueSignature}:${request.filePath}:${request.position}`
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

function toQuickInfoDisplayTokensCacheKey(
  request: QuickInfoRequest,
  tokenThemeCacheKey: string,
  displayText: string
): string {
  const displayTextHash = hashQuickInfoDisplayText(displayText)
  return `${QUICK_INFO_DISPLAY_TOKENS_CACHE_VERSION}:${toQuickInfoCacheKey(
    request
  )}:${tokenThemeCacheKey}:${displayText.length}:${displayTextHash}`
}

function toQuickInfoDocumentationCacheKey(documentationText: string): string {
  const documentationTextHash = hashQuickInfoDisplayText(documentationText)
  return `${QUICK_INFO_DOCUMENTATION_CACHE_VERSION}:${documentationText.length}:${documentationTextHash}`
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

function readQuickInfoDocumentationCache(
  cacheKey: string
): React.ReactNode | string | undefined {
  const entry = quickInfoDocumentationCacheByKey.get(cacheKey)
  if (!entry) {
    return undefined
  }

  if (entry.expiresAt <= Date.now()) {
    quickInfoDocumentationCacheByKey.delete(cacheKey)
    return undefined
  }

  quickInfoDocumentationCacheByKey.delete(cacheKey)
  quickInfoDocumentationCacheByKey.set(cacheKey, entry)
  return entry.value
}

function writeQuickInfoDocumentationCache(
  cacheKey: string,
  value: React.ReactNode | string
): void {
  quickInfoDocumentationCacheByKey.set(cacheKey, {
    value,
    expiresAt: Date.now() + QUICK_INFO_CACHE_TTL_MS,
  })

  while (quickInfoDocumentationCacheByKey.size > QUICK_INFO_CACHE_MAX_ENTRIES) {
    const oldest = quickInfoDocumentationCacheByKey.keys().next().value
    if (typeof oldest !== 'string') {
      break
    }

    quickInfoDocumentationCacheByKey.delete(oldest)
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

async function requestQuickInfo(
  request: QuickInfoRequest
): Promise<QuickInfoData | null> {
  try {
    const result = await getProjectClientQuickInfoAtPosition(
      request.filePath,
      request.position,
      undefined,
      request.runtime
    )
    return normalizeQuickInfoResult(result)
  } catch {
    return null
  }
}

async function requestDisplayTokens(
  request: QuickInfoRequest,
  value: string,
  tokenThemeConfig: ConfigurationOptions['theme'] | undefined
): Promise<QuickInfoTokenizedDisplayText | null> {
  try {
    const result = await getProjectClientTokens({
      value,
      language: 'typescript',
      theme: tokenThemeConfig,
      allowErrors: true,
      waitForWarmResult: true,
      runtime: request.runtime,
    })
    return normalizeQuickInfoTokenizedDisplayText(result)
  } catch {
    return null
  }
}

export function clearQuickInfoClientPopoverCaches(): void {
  quickInfoCacheByKey.clear()
  quickInfoInFlightByKey.clear()
  quickInfoDisplayTokensCacheByKey.clear()
  quickInfoDisplayTokensInFlightByKey.clear()
  quickInfoDocumentationCacheByKey.clear()
  quickInfoDocumentationInFlightByKey.clear()
}

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
