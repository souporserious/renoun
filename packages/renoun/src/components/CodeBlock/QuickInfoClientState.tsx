'use client'
import React from 'react'

import {
  getProjectClientBrowserRuntime,
  getProjectClientRefreshVersion,
  getQuickInfoAtPosition as getProjectClientQuickInfoAtPosition,
  getTokens as getProjectClientTokens,
  hasRetainedProjectClientBrowserRuntime,
  onProjectClientBrowserRuntimeChange,
  onProjectClientRefreshVersionChange,
} from '../../project/client.ts'
import type { ProjectServerRuntime } from '../../project/runtime-env.ts'
import type { ConfigurationOptions } from '../Config/types.ts'

export interface QuickInfoData {
  displayText: string
  documentationText: string
}

export interface QuickInfoRequest {
  filePath: string
  position: number
  valueSignature?: string
  runtime: ProjectServerRuntime
  themeConfig?: ConfigurationOptions['theme']
}

interface ResolvedQuickInfoRequest extends QuickInfoRequest {
  projectVersion?: string
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

function useProjectClientBrowserRuntimeSnapshot(
  fallback: ProjectServerRuntime | undefined
): ProjectServerRuntime | undefined {
  return React.useSyncExternalStore(
    onProjectClientBrowserRuntimeChange,
    getProjectClientBrowserRuntime,
    () => fallback
  )
}

function useProjectClientRefreshVersionSnapshot(): string {
  return React.useSyncExternalStore(
    onProjectClientRefreshVersionChange,
    getProjectClientRefreshVersion,
    getProjectClientRefreshVersion
  )
}

function useQuickInfoRuntimeSelection(
  initialRuntime: ProjectServerRuntime | undefined
): ProjectServerRuntime | undefined {
  const selectionRef = React.useRef<{
    runtimeKey: string | undefined
    hasRetainedBrowserRuntime: boolean
  } | null>(null)
  const initialRuntimeKey = toProjectServerRuntimeKey(initialRuntime)

  if (
    selectionRef.current === null ||
    selectionRef.current.runtimeKey !== initialRuntimeKey
  ) {
    selectionRef.current = {
      runtimeKey: initialRuntimeKey,
      hasRetainedBrowserRuntime: hasRetainedProjectClientBrowserRuntime(),
    }
  }

  const browserRuntime = useProjectClientBrowserRuntimeSnapshot(initialRuntime)

  return resolveQuickInfoRuntime(
    initialRuntime,
    browserRuntime,
    selectionRef.current.hasRetainedBrowserRuntime
  )
}

export function resolveQuickInfoRuntime(
  initialRuntime: ProjectServerRuntime | undefined,
  browserRuntime: ProjectServerRuntime | undefined,
  hasRetainedBrowserRuntime: boolean
): ProjectServerRuntime | undefined {
  if (initialRuntime && hasRetainedBrowserRuntime) {
    return initialRuntime
  }

  if (browserRuntime) {
    return browserRuntime
  }

  return initialRuntime
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

  const defaultVersion = `${selectedRuntime.id}:0:0`

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
    return requestProjectVersion ?? defaultVersion
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
  const browserRuntime = useProjectClientBrowserRuntimeSnapshot(request?.runtime)
  const selectedRuntime = useQuickInfoRuntimeSelection(request?.runtime)
  const refreshVersion = useProjectClientRefreshVersionSnapshot()
  const effectiveProjectVersion = React.useMemo(() => {
    return resolveQuickInfoProjectVersion({
      browserRuntime,
      selectedRuntime,
      requestProjectVersion: undefined,
      refreshVersion,
    })
  }, [browserRuntime, refreshVersion, selectedRuntime])
  const effectiveRequest = React.useMemo(() => {
    if (!request || !selectedRuntime) {
      return undefined
    }

    return {
      ...request,
      runtime: selectedRuntime,
      projectVersion: effectiveProjectVersion,
    } satisfies ResolvedQuickInfoRequest
  }, [effectiveProjectVersion, request, selectedRuntime])
  const requestKey = effectiveRequest ? toQuickInfoCacheKey(effectiveRequest) : ''
  const displayText = resolvedQuickInfo?.displayText ?? ''

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

    if (!effectiveRequest || !displayText) {
      setResolvedDisplayTokens(null)
      return
    }

    setResolvedDisplayTokens(null)
    void getQuickInfoDisplayTokens({
      displayText,
      runtime: effectiveRequest.runtime,
      tokenThemeConfig,
    }).then((value) => {
      if (!isDisposed) {
        setResolvedDisplayTokens(value)
      }
    })

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
  runtime: ProjectServerRuntime
  tokenThemeConfig: ConfigurationOptions['theme'] | undefined
}): Promise<QuickInfoTokenizedDisplayText | null> {
  const { displayText, runtime, tokenThemeConfig } = options
  if (!displayText) {
    return null
  }

  return requestDisplayTokens(runtime, displayText, tokenThemeConfig)
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

function toProjectServerRuntimeKey(
  runtime: ProjectServerRuntime | undefined
): string | undefined {
  if (!runtime) {
    return undefined
  }

  return `${runtime.id}:${runtime.host ?? 'localhost'}:${runtime.port}`
}

function toQuickInfoCacheKey(request: ResolvedQuickInfoRequest): string {
  const projectVersion = request.projectVersion ?? `${request.runtime.id}:0:0`
  const valueSignature = request.valueSignature ?? ''
  return `${projectVersion}:${valueSignature}:${request.filePath}:${request.position}`
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
    const result = await getProjectClientQuickInfoAtPosition(
      request.filePath,
      request.position,
      undefined,
      request.runtime,
      toQuickInfoCacheKey(request)
    )

    return normalizeQuickInfoResult(result)
  } catch {
    return null
  }
}

async function requestDisplayTokens(
  runtime: ProjectServerRuntime,
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
      runtime,
    })

    return normalizeQuickInfoTokenizedDisplayText(result)
  } catch {
    return null
  }
}

export const __TEST_ONLY__ = {
  getQuickInfoForRequest,
  resolveQuickInfoProjectVersion,
  resolveQuickInfoRuntime,
}
