'use client'
import React, {
  createContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

type QuickInfo = {
  anchorId: string
  children: React.ReactNode | null
} | null

export const QuickInfoContext = createContext<{
  quickInfo: QuickInfo
  setQuickInfo: (info: QuickInfo) => void
  resetQuickInfo: () => void
  clearTimeouts: () => void
} | null>(null)

export function useQuickInfoContext() {
  const context = React.useContext(QuickInfoContext)
  if (!context) {
    throw new Error('QuickInfoContext must be used within a QuickInfoContainer')
  }
  return context
}

let closeTimeoutId: ReturnType<typeof setTimeout> | null = null

export function QuickInfoProvider({
  children,
  openDelay = 800,
  closeDelay = 180,
}: {
  children: React.ReactNode
  openDelay?: number
  closeDelay?: number
}) {
  const [quickInfo, setQuickInfo] = useState<QuickInfo>(null)
  const openTimeoutId = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimeouts = () => {
    if (openTimeoutId.current) {
      clearTimeout(openTimeoutId.current)
      openTimeoutId.current = null
    }
    if (closeTimeoutId) {
      clearTimeout(closeTimeoutId)
      closeTimeoutId = null
    }
  }
  const value = useMemo(
    () => ({
      clearTimeouts,
      quickInfo,
      setQuickInfo: (info: QuickInfo) => {
        if (quickInfo === null) {
          openTimeoutId.current = setTimeout(() => {
            setQuickInfo(info)
            openTimeoutId.current = null
          }, openDelay)
        } else {
          if (closeTimeoutId) {
            clearTimeout(closeTimeoutId)
          }
          setQuickInfo(info)
        }
      },
      resetQuickInfo: () => {
        if (openTimeoutId.current) {
          clearTimeout(openTimeoutId.current)
        } else {
          if (closeTimeoutId) {
            clearTimeout(closeTimeoutId)
          }
          closeTimeoutId = setTimeout(() => {
            setQuickInfo(null)
            closeTimeoutId = null
          }, closeDelay)
        }
      },
    }),
    [quickInfo]
  )

  useEffect(() => {
    const openId = openTimeoutId.current
    return () => {
      if (openId) {
        clearTimeout(openId)
      }
      if (closeTimeoutId) {
        clearTimeout(closeTimeoutId)
      }
    }
  }, [])

  return (
    <QuickInfoContext.Provider value={value}>
      {children}
      {quickInfo ? createPortal(quickInfo.children, document.body) : null}
    </QuickInfoContext.Provider>
  )
}
