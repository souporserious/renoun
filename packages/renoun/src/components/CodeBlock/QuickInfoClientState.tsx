'use client'
import React from 'react'

import {
  getAnalysisClientBrowserRuntime,
  getAnalysisClientRefreshVersion,
  getAnalysisClientRetainedBrowserRuntimeActivationKey,
  getQuickInfoAtPosition as getAnalysisClientQuickInfoAtPosition,
  getTokens as getAnalysisClientTokens,
  hasRetainedAnalysisClientBrowserRuntime,
  onAnalysisClientBrowserRuntimeRetentionChange,
  onAnalysisClientBrowserRefreshNotification,
  onAnalysisClientBrowserRuntimeChange,
  onAnalysisClientRefreshVersionChange,
} from '../../analysis/browser-client.ts'
import type { SourceTextHydrationMetadata } from '../../analysis/query/source-text-metadata.ts'
import type { AnalysisServerRuntime } from '../../analysis/runtime-env.ts'
import type { ConfigurationOptions } from '../Config/types.ts'

export interface QuickInfoData {
  displayText: string
  documentationText: string
}

export interface QuickInfoRequest {
  filePath: string
  position: number
  valueSignature?: string
  sourceMetadata?: SourceTextHydrationMetadata
  analysisVersion?: string
  runtime: AnalysisServerRuntime
  themeConfig?: ConfigurationOptions['theme']
}

interface ResolvedQuickInfoRequest extends QuickInfoRequest {
  analysisVersion?: string
}

interface QuickInfoTokenizedDisplayToken {
  value: string
  style: Record<string, string>
}

export type QuickInfoTokenizedDisplayText = QuickInfoTokenizedDisplayToken[][]

interface UseResolvedQuickInfoClientStateOptions {
  quickInfo?: QuickInfoData
  request?: QuickInfoRequest
  tokenThemeConfig?: ConfigurationOptions['theme']
}

export interface ResolvedQuickInfoClientState {
  isLoading: boolean
  resolvedQuickInfo: QuickInfoData | null
  resolvedDisplayTokens: QuickInfoTokenizedDisplayText | null
}

function useAnalysisClientBrowserRuntimeSnapshot(
  fallback: AnalysisServerRuntime | undefined
): AnalysisServerRuntime | undefined {
  return React.useSyncExternalStore(
    onAnalysisClientBrowserRuntimeChange,
    getAnalysisClientBrowserRuntime,
    () => fallback
  )
}

function subscribeToAnalysisClientRefreshChanges(
  listener: () => void
): () => void {
  const unsubscribeRefreshVersion = onAnalysisClientRefreshVersionChange(() => {
    listener()
  })
  const unsubscribeRefreshNotification =
    onAnalysisClientBrowserRefreshNotification(() => {
      listener()
    })

  return () => {
    unsubscribeRefreshVersion()
    unsubscribeRefreshNotification()
  }
}

function useAnalysisClientRefreshVersionSnapshot(
  runtime: AnalysisServerRuntime | undefined
): string {
  return React.useSyncExternalStore(
    subscribeToAnalysisClientRefreshChanges,
    () => getAnalysisClientRefreshVersion(runtime),
    () => getAnalysisClientRefreshVersion(runtime)
  )
}

function useAnalysisClientBrowserRuntimeRetentionSnapshot(): boolean {
  return React.useSyncExternalStore(
    onAnalysisClientBrowserRuntimeRetentionChange,
    hasRetainedAnalysisClientBrowserRuntime,
    hasRetainedAnalysisClientBrowserRuntime
  )
}

function useQuickInfoRuntimeSelection(
  initialRuntime: AnalysisServerRuntime | undefined
): AnalysisServerRuntime | undefined {
  const browserRuntime = useAnalysisClientBrowserRuntimeSnapshot(initialRuntime)
  const hasRetainedBrowserRuntime =
    useAnalysisClientBrowserRuntimeRetentionSnapshot()

  return resolveQuickInfoRuntime(
    initialRuntime,
    browserRuntime,
    hasRetainedBrowserRuntime,
    getAnalysisClientRetainedBrowserRuntimeActivationKey()
  )
}

export function resolveQuickInfoRuntime(
  initialRuntime: AnalysisServerRuntime | undefined,
  browserRuntime: AnalysisServerRuntime | undefined,
  hasRetainedBrowserRuntime: boolean,
  retainedBrowserRuntimeKeyAtActivation?: string
): AnalysisServerRuntime | undefined {
  if (initialRuntime && hasRetainedBrowserRuntime) {
    const currentBrowserRuntimeKey = toAnalysisServerRuntimeKey(browserRuntime)

    if (
      browserRuntime &&
      retainedBrowserRuntimeKeyAtActivation &&
      currentBrowserRuntimeKey &&
      currentBrowserRuntimeKey !== retainedBrowserRuntimeKeyAtActivation
    ) {
      return browserRuntime
    }

    return initialRuntime
  }

  if (browserRuntime) {
    return browserRuntime
  }

  return initialRuntime
}

export function resolveQuickInfoAnalysisVersion(options: {
  selectedRuntime: AnalysisServerRuntime | undefined
  requestAnalysisVersion: string | undefined
  refreshVersion: string
}): string | undefined {
  const { selectedRuntime, requestAnalysisVersion, refreshVersion } = options

  if (!selectedRuntime) {
    return requestAnalysisVersion
  }

  const matchingRequestAnalysisVersion = getQuickInfoRequestAnalysisVersion(
    requestAnalysisVersion,
    selectedRuntime
  )

  if (refreshVersion === '0:0') {
    return matchingRequestAnalysisVersion ?? `${selectedRuntime.id}:0:0`
  }

  return `${selectedRuntime.id}:${refreshVersion}`
}

export function useResolvedQuickInfoClientState({
  quickInfo,
  request,
  tokenThemeConfig,
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
  const selectedRuntime = useQuickInfoRuntimeSelection(request?.runtime)
  const refreshVersion = useAnalysisClientRefreshVersionSnapshot(selectedRuntime)
  const effectiveAnalysisVersion = React.useMemo(() => {
    return resolveQuickInfoAnalysisVersion({
      selectedRuntime,
      requestAnalysisVersion: request?.analysisVersion,
      refreshVersion,
    })
  }, [refreshVersion, request?.analysisVersion, selectedRuntime])
  const effectiveRequest = React.useMemo(() => {
    if (!request || !selectedRuntime) {
      return undefined
    }

    return {
      ...request,
      runtime: selectedRuntime,
      analysisVersion: effectiveAnalysisVersion,
    } satisfies ResolvedQuickInfoRequest
  }, [effectiveAnalysisVersion, request, selectedRuntime])
  const requestKey = effectiveRequest ? toQuickInfoCacheKey(effectiveRequest) : ''
  const hydrationRequestIdentityKey = React.useMemo(() => {
    return toQuickInfoHydrationIdentityKey(request)
  }, [request])
  const hydratedQuickInfoRequestKeyRef = React.useRef<string | null>(
    quickInfo !== undefined && requestKey ? requestKey : null
  )
  const previousHydrationRequestIdentityKeyRef =
    React.useRef(hydrationRequestIdentityKey)
  const previousHasHydratedQuickInfoRef = React.useRef(
    quickInfo !== undefined
  )
  const displayText = resolvedQuickInfo?.displayText ?? ''

  React.useEffect(() => {
    const hasHydratedQuickInfo = quickInfo !== undefined
    const didHydrationIdentityChange =
      previousHydrationRequestIdentityKeyRef.current !==
      hydrationRequestIdentityKey
    const didHydratedQuickInfoAvailabilityChange =
      previousHasHydratedQuickInfoRef.current !== hasHydratedQuickInfo

    if (
      !didHydrationIdentityChange &&
      !didHydratedQuickInfoAvailabilityChange
    ) {
      return
    }

    previousHydrationRequestIdentityKeyRef.current =
      hydrationRequestIdentityKey
    previousHasHydratedQuickInfoRef.current = hasHydratedQuickInfo
    hydratedQuickInfoRequestKeyRef.current =
      hasHydratedQuickInfo && requestKey ? requestKey : null
  }, [hydrationRequestIdentityKey, quickInfo, requestKey])

  React.useEffect(() => {
    let isDisposed = false

    if (
      shouldReuseHydratedQuickInfo({
        quickInfo,
        canRequestQuickInfo: effectiveRequest !== undefined,
        requestKey,
        hydratedRequestKey: hydratedQuickInfoRequestKeyRef.current,
      })
    ) {
      setResolvedQuickInfo(quickInfo ?? null)
      setIsLoading(false)
      return
    }

    if (!effectiveRequest) {
      setResolvedQuickInfo(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    void (async () => {
      try {
        const value = await getQuickInfoForRequest(effectiveRequest)
        if (isDisposed) {
          return
        }

        setResolvedQuickInfo(value)
      } catch {
        if (isDisposed) {
          return
        }

        setResolvedQuickInfo(null)
      } finally {
        if (!isDisposed) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      isDisposed = true
    }
  }, [effectiveRequest, quickInfo, requestKey])

  React.useEffect(() => {
    let isDisposed = false

    if (!effectiveRequest || !displayText) {
      setResolvedDisplayTokens(null)
      return
    }

    setResolvedDisplayTokens(null)
    void (async () => {
      try {
        const value = await getQuickInfoDisplayTokens({
          displayText,
          runtime: effectiveRequest.runtime,
          tokenThemeConfig,
        })
        if (!isDisposed) {
          setResolvedDisplayTokens(value)
        }
      } catch {
        if (!isDisposed) {
          setResolvedDisplayTokens(null)
        }
      }
    })()

    return () => {
      isDisposed = true
    }
  }, [
    displayText,
    effectiveRequest,
    requestKey,
    tokenThemeConfig,
  ])

  return {
    isLoading,
    resolvedQuickInfo,
    resolvedDisplayTokens,
  }
}

export async function getQuickInfoForRequest(
  request: ResolvedQuickInfoRequest
): Promise<QuickInfoData | null> {
  return requestQuickInfo(request)
}

async function getQuickInfoDisplayTokens(options: {
  displayText: string
  runtime: AnalysisServerRuntime
  tokenThemeConfig: ConfigurationOptions['theme'] | undefined
}): Promise<QuickInfoTokenizedDisplayText | null> {
  const { displayText, runtime, tokenThemeConfig } = options
  if (!displayText) {
    return null
  }

  return requestDisplayTokens(runtime, displayText, tokenThemeConfig)
}

function toAnalysisServerRuntimeKey(
  runtime: AnalysisServerRuntime | undefined
): string | undefined {
  if (!runtime) {
    return undefined
  }

  return `${runtime.id}:${runtime.host ?? 'localhost'}:${runtime.port}`
}

function toQuickInfoCacheKey(request: ResolvedQuickInfoRequest): string {
  const analysisVersion = request.analysisVersion ?? `${request.runtime.id}:0:0`
  const valueSignature = request.valueSignature ?? ''
  return serializeQuickInfoKey([
    analysisVersion,
    toAnalysisServerRuntimeKey(request.runtime) ?? '',
    valueSignature,
    request.filePath,
    request.position,
  ])
}

function toQuickInfoHydrationIdentityKey(
  request: QuickInfoRequest | undefined
): string {
  if (!request) {
    return ''
  }

  return serializeQuickInfoKey([
    request.analysisVersion ?? '',
    request.valueSignature ?? '',
    request.filePath,
    request.position,
    toAnalysisServerRuntimeKey(request.runtime) ?? '',
    request.sourceMetadata?.language ?? '',
    request.sourceMetadata?.value ?? '',
  ])
}

function serializeQuickInfoKey(
  parts: ReadonlyArray<string | number>
): string {
  return JSON.stringify(parts)
}

function shouldReuseHydratedQuickInfo(options: {
  quickInfo: QuickInfoData | undefined
  canRequestQuickInfo: boolean
  requestKey: string
  hydratedRequestKey: string | null
}): boolean {
  const {
    quickInfo,
    canRequestQuickInfo,
    requestKey,
    hydratedRequestKey,
  } = options

  if (quickInfo === undefined) {
    return false
  }

  if (!canRequestQuickInfo || requestKey.length === 0) {
    return true
  }

  return hydratedRequestKey === requestKey
}

function getQuickInfoRequestAnalysisVersion(
  requestAnalysisVersion: string | undefined,
  runtime: AnalysisServerRuntime
): string | undefined {
  if (
    typeof requestAnalysisVersion !== 'string' ||
    requestAnalysisVersion.length === 0
  ) {
    return undefined
  }

  const lastColonIndex = requestAnalysisVersion.lastIndexOf(':')
  if (lastColonIndex === -1) {
    return undefined
  }

  const previousColonIndex = requestAnalysisVersion.lastIndexOf(
    ':',
    lastColonIndex - 1
  )
  if (previousColonIndex === -1) {
    return undefined
  }

  return requestAnalysisVersion.slice(0, previousColonIndex) === runtime.id
    ? requestAnalysisVersion
    : undefined
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

      normalizedTokens.push({
        value: candidate.value,
        style: normalizeQuickInfoTokenStyle(candidate.style),
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
  request: ResolvedQuickInfoRequest
): Promise<QuickInfoData | null> {
  try {
    const result = await getAnalysisClientQuickInfoAtPosition(
      request.filePath,
      request.position,
      undefined,
      request.runtime,
      toQuickInfoCacheKey(request),
      request.sourceMetadata
    )

    return normalizeQuickInfoResult(result)
  } catch {
    return null
  }
}

async function requestDisplayTokens(
  runtime: AnalysisServerRuntime,
  value: string,
  tokenThemeConfig: ConfigurationOptions['theme'] | undefined
): Promise<QuickInfoTokenizedDisplayText | null> {
  try {
    const result = await getAnalysisClientTokens({
      value,
      language: 'typescript',
      theme: tokenThemeConfig,
      allowErrors: true,
      waitForWarmResult: true,
      runtime,
    })

    return normalizeQuickInfoTokenizedDisplayText(result)
  } catch {
    return null
  }
}

export const __TEST_ONLY__ = {
  getQuickInfoForRequest,
  resolveQuickInfoAnalysisVersion,
  resolveQuickInfoRuntime,
  shouldReuseHydratedQuickInfo,
}
