'use client'
import React, {
  createContext,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { CSSObject } from 'restyle'

import {
  getQuickInfoAtPosition as getAnalysisClientQuickInfoAtPosition,
  getTokens as getAnalysisClientTokens,
} from '../../analysis/browser-client.ts'
import type { SourceTextHydrationMetadata } from '../../analysis/query/source-text-metadata.ts'
import type { TokenDiagnostic } from '../../utils/get-tokens.ts'
import type { TokenizedLines } from '../../utils/get-tokens.ts'
import type { AnalysisServerRuntime } from '../../analysis/runtime-env.ts'
import type { Languages as GrammarLanguage } from '../../grammars/index.ts'
import type { ConfigurationOptions } from '../Config/types.ts'
import {
  QuickInfoClientPopover,
  QuickInfoLoading,
} from './QuickInfoClientPopover.tsx'
import type { QuickInfoTheme } from './QuickInfoContent.tsx'

type QuickInfoState = {
  anchorId: string
  entryId: string
} | null

export interface QuickInfoRequest {
  cacheKey: string
  filePath: string
  position: number
  sourceMetadata?: SourceTextHydrationMetadata
}

export interface QuickInfoEntry {
  id: string
  quickInfo?: {
    displayText: string
    documentationText: string
  }
  displayTokens?: TokenizedLines
  request?: QuickInfoRequest
  diagnostics?: TokenDiagnostic[]
}

export interface QuickInfoPopoverProps {
  diagnostics?: TokenDiagnostic[]
  quickInfo?: {
    displayText: string
    documentationText: string
  }
  displayTokens?: TokenizedLines
  theme: QuickInfoTheme
  isLoading?: boolean
  css?: CSSObject
  className?: string
  style?: React.CSSProperties
  tokenThemeConfig?: ConfigurationOptions['theme']
  tokenRuntime?: AnalysisServerRuntime
  tokenLanguages?: GrammarLanguage[]
}

type ResolvedQuickInfoEntry = Pick<
  QuickInfoEntry,
  'quickInfo' | 'displayTokens'
>

export function DefaultQuickInfoPopover({
  diagnostics,
  quickInfo,
  displayTokens,
  theme,
  isLoading = false,
  css,
  className,
  style,
  tokenThemeConfig,
  tokenRuntime,
  tokenLanguages,
}: QuickInfoPopoverProps) {
  if (isLoading) {
    return (
      <QuickInfoLoading
        theme={theme}
        css={css}
        className={className}
        style={style}
      />
    )
  }

  return (
    <QuickInfoClientPopover
      diagnostics={diagnostics}
      quickInfo={quickInfo}
      displayTokens={displayTokens}
      theme={theme}
      css={css}
      className={className}
      style={style}
      tokenThemeConfig={tokenThemeConfig}
      runtime={tokenRuntime}
      languages={tokenLanguages}
    />
  )
}

/**
 * Context for managing quick info popovers.
 * @internal
 */
export const QuickInfoContext = createContext<{
  quickInfo: QuickInfoState
  setQuickInfo: (info: QuickInfoState) => void
  resetQuickInfo: (immediate?: boolean) => void
  clearTimeouts: () => void
} | null>(null)

/**
 * Hook to access the quick info context.
 * @internal
 */
export function useQuickInfoContext() {
  const context = React.useContext(QuickInfoContext)
  if (!context) {
    throw new Error('QuickInfoContext must be used within a QuickInfoContainer')
  }
  return context
}

/**
 * Provider for managing quick info popovers.
 * @internal
 */
export function QuickInfoProvider({
  children,
  openDelay = 800,
  closeDelay = 180,
  entries = [],
  popoverTheme,
  PopoverComponent = DefaultQuickInfoPopover,
  tokenThemeConfig,
  tokenRuntime,
  tokenLanguages,
}: {
  children: React.ReactNode
  openDelay?: number
  closeDelay?: number
  entries?: QuickInfoEntry[]
  popoverTheme?: QuickInfoTheme
  PopoverComponent?: React.ComponentType<QuickInfoPopoverProps>
  tokenThemeConfig?: ConfigurationOptions['theme']
  tokenRuntime?: AnalysisServerRuntime
  tokenLanguages?: GrammarLanguage[]
}) {
  const [quickInfo, setQuickInfo] = useState<QuickInfoState>(null)
  const [resolvedEntriesByRequestKey, setResolvedEntriesByRequestKey] =
    useState<Map<string, ResolvedQuickInfoEntry | null>>(() => new Map())
  const openTimeoutId = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimeoutId = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRequestMap = useRef<
    Map<string, Promise<ResolvedQuickInfoEntry | null>>
  >(new Map())
  const entriesById = useMemo(() => {
    return new Map(entries.map((entry) => [entry.id, entry] as const))
  }, [entries])
  const activeBaseEntry = quickInfo
    ? entriesById.get(quickInfo.entryId)
    : undefined
  const activeResolvedEntry =
    activeBaseEntry?.request &&
    resolvedEntriesByRequestKey.has(activeBaseEntry.request.cacheKey)
      ? resolvedEntriesByRequestKey.get(activeBaseEntry.request.cacheKey)
      : undefined
  const activeEntry = useMemo(() => {
    if (!activeBaseEntry) {
      return undefined
    }

    if (!activeResolvedEntry) {
      return activeBaseEntry
    }

    return {
      ...activeBaseEntry,
      quickInfo: activeBaseEntry.quickInfo ?? activeResolvedEntry.quickInfo,
      displayTokens:
        activeBaseEntry.displayTokens ?? activeResolvedEntry.displayTokens,
    }
  }, [activeBaseEntry, activeResolvedEntry])
  const isActiveEntryLoading = Boolean(
    activeBaseEntry?.request &&
      !activeEntry?.quickInfo &&
      activeResolvedEntry === undefined
  )
  const clearTimeouts = () => {
    if (openTimeoutId.current) {
      clearTimeout(openTimeoutId.current)
      openTimeoutId.current = null
    }
    if (closeTimeoutId.current) {
      clearTimeout(closeTimeoutId.current)
      closeTimeoutId.current = null
    }
  }
  const value = useMemo(
    () => ({
      clearTimeouts,
      quickInfo,
      setQuickInfo: (info: QuickInfoState) => {
        if (openTimeoutId.current) {
          clearTimeout(openTimeoutId.current)
          openTimeoutId.current = null
        }

        if (closeTimeoutId.current) {
          clearTimeout(closeTimeoutId.current)
          closeTimeoutId.current = null
        }

        if (quickInfo === null) {
          openTimeoutId.current = setTimeout(() => {
            setQuickInfo(info)
            openTimeoutId.current = null
          }, openDelay)
        } else {
          setQuickInfo(info)
        }
      },
      resetQuickInfo: (immediate?: boolean) => {
        if (openTimeoutId.current) {
          clearTimeout(openTimeoutId.current)
          openTimeoutId.current = null
        } else if (immediate) {
          if (closeTimeoutId.current) {
            clearTimeout(closeTimeoutId.current)
            closeTimeoutId.current = null
          }
          setQuickInfo(null)
        } else {
          if (closeTimeoutId.current) {
            clearTimeout(closeTimeoutId.current)
          }
          closeTimeoutId.current = setTimeout(() => {
            setQuickInfo(null)
            closeTimeoutId.current = null
          }, closeDelay)
        }
      },
    }),
    [closeDelay, openDelay, quickInfo]
  )

  useEffect(() => {
    return () => {
      if (openTimeoutId.current) {
        clearTimeout(openTimeoutId.current)
        openTimeoutId.current = null
      }
      if (closeTimeoutId.current) {
        clearTimeout(closeTimeoutId.current)
        closeTimeoutId.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (
      !activeBaseEntry?.request ||
      activeBaseEntry.quickInfo ||
      activeResolvedEntry !== undefined
    ) {
      return
    }

    const { request } = activeBaseEntry
    const { cacheKey } = request
    let isDisposed = false
    let requestPromise = inFlightRequestMap.current.get(cacheKey)

    if (!requestPromise) {
      requestPromise = resolveQuickInfoEntry({
        request,
        tokenThemeConfig,
        tokenRuntime,
        tokenLanguages,
      })
      inFlightRequestMap.current.set(cacheKey, requestPromise)
      void requestPromise.finally(() => {
        if (inFlightRequestMap.current.get(cacheKey) === requestPromise) {
          inFlightRequestMap.current.delete(cacheKey)
        }
      })
    }

    void requestPromise.then((resolvedEntry) => {
      if (isDisposed) {
        return
      }

      startTransition(() => {
        setResolvedEntriesByRequestKey((current) => {
          if (current.has(cacheKey)) {
            return current
          }

          const next = new Map(current)
          next.set(cacheKey, resolvedEntry)
          return next
        })
      })
    })

    return () => {
      isDisposed = true
    }
  }, [
    activeBaseEntry,
    activeResolvedEntry,
    tokenLanguages,
    tokenRuntime,
    tokenThemeConfig,
  ])

  const shouldRenderPopover = Boolean(
    popoverTheme &&
      activeEntry &&
      (isActiveEntryLoading ||
        activeEntry.quickInfo ||
        activeEntry.diagnostics?.length)
  )

  return (
    <QuickInfoContext.Provider value={value}>
      {children}
      {shouldRenderPopover && popoverTheme && activeEntry
        ? createPortal(
            isActiveEntryLoading ? (
              <PopoverComponent
                diagnostics={activeEntry.diagnostics}
                quickInfo={activeEntry.quickInfo}
                displayTokens={activeEntry.displayTokens}
                theme={popoverTheme}
                isLoading
                tokenThemeConfig={tokenThemeConfig}
                tokenRuntime={tokenRuntime}
                tokenLanguages={tokenLanguages}
              />
            ) : (
              <React.Suspense
                fallback={
                  <PopoverComponent
                    diagnostics={activeEntry.diagnostics}
                    quickInfo={activeEntry.quickInfo}
                    displayTokens={activeEntry.displayTokens}
                    theme={popoverTheme}
                    isLoading
                    tokenThemeConfig={tokenThemeConfig}
                    tokenRuntime={tokenRuntime}
                    tokenLanguages={tokenLanguages}
                  />
                }
              >
                <PopoverComponent
                  diagnostics={activeEntry.diagnostics}
                  quickInfo={activeEntry.quickInfo}
                  displayTokens={activeEntry.displayTokens}
                  theme={popoverTheme}
                  tokenThemeConfig={tokenThemeConfig}
                  tokenRuntime={tokenRuntime}
                  tokenLanguages={tokenLanguages}
                />
              </React.Suspense>
            ),
            document.body
          )
        : null}
    </QuickInfoContext.Provider>
  )
}

async function resolveQuickInfoEntry({
  request,
  tokenThemeConfig,
  tokenRuntime,
  tokenLanguages,
}: {
  request: QuickInfoRequest
  tokenThemeConfig?: ConfigurationOptions['theme']
  tokenRuntime?: AnalysisServerRuntime
  tokenLanguages?: GrammarLanguage[]
}): Promise<ResolvedQuickInfoEntry | null> {
  try {
    const quickInfo = await getAnalysisClientQuickInfoAtPosition(
      request.filePath,
      request.position,
      undefined,
      tokenRuntime,
      request.cacheKey,
      request.sourceMetadata
    )

    if (!quickInfo) {
      return null
    }

    let displayTokens: TokenizedLines | undefined

    if (quickInfo.displayText && tokenThemeConfig) {
      try {
        displayTokens = await getAnalysisClientTokens({
          value: quickInfo.displayText,
          language: 'typescript',
          languages: tokenLanguages,
          theme: tokenThemeConfig,
          allowErrors: true,
          waitForWarmResult: true,
          runtime: tokenRuntime,
        })
      } catch {
        displayTokens = undefined
      }
    }

    return {
      quickInfo,
      displayTokens,
    }
  } catch {
    return null
  }
}
