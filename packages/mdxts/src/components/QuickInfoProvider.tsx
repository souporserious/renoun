'use client'
import React, { createContext, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type QuickInfo = {
  anchorId: string
  children: React.ReactNode | null
} | null

export const QuickInfoContext = createContext<{
  quickInfo: QuickInfo
  setQuickInfo: React.Dispatch<React.SetStateAction<QuickInfo>>
  resetQuickInfo: () => void
  clearTimeout: () => void
} | null>(null)

export function useQuickInfoContext() {
  const context = React.useContext(QuickInfoContext)
  if (!context) {
    throw new Error('QuickInfoContext must be used within a QuickInfoContainer')
  }
  return context
}

export function QuickInfoProvider({ children }: { children: React.ReactNode }) {
  const [quickInfo, setQuickInfo] = useState<QuickInfo>(null)
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null)
  const value = useMemo(
    () => ({
      quickInfo,
      setQuickInfo,
      resetQuickInfo: () => {
        if (timeoutId.current) {
          clearTimeout(timeoutId.current)
        }
        timeoutId.current = setTimeout(() => {
          setQuickInfo(null)
        }, 180)
      },
      clearTimeout: () => {
        if (timeoutId.current) {
          clearTimeout(timeoutId.current)
          timeoutId.current = null
        }
      },
    }),
    [quickInfo]
  )
  return (
    <QuickInfoContext.Provider value={value}>
      {children}
      {quickInfo ? createPortal(quickInfo.children, document.body) : null}
    </QuickInfoContext.Provider>
  )
}
