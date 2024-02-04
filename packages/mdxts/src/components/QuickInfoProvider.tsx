'use client'
import React, { createContext, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

type QuickInfo = {
  anchorId: string
  children: React.ReactNode | null
} | null

export const QuickInfoContext = createContext<{
  quickInfo: QuickInfo
  setQuickInfo: React.Dispatch<React.SetStateAction<QuickInfo>>
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
  const value = useMemo(() => ({ quickInfo, setQuickInfo }), [quickInfo])
  return (
    <QuickInfoContext.Provider value={value}>
      {children}
      {quickInfo ? createPortal(quickInfo.children, document.body) : null}
    </QuickInfoContext.Provider>
  )
}
