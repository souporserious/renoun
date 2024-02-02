'use client'
import React, { createContext, useMemo, useRef, useState } from 'react'

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

export function QuickInfoProvider({
  inline,
  paddingHorizontal,
  paddingVertical,
  children,
}: {
  inline?: boolean
  paddingHorizontal?: string
  paddingVertical?: string
  children: React.ReactNode
}) {
  const [quickInfo, setQuickInfo] = useState<QuickInfo>(null)
  const scrollLeftOffset = useRef(0)
  const Element = inline ? 'span' : 'div'

  return (
    <QuickInfoContext.Provider
      value={useMemo(() => ({ quickInfo, setQuickInfo }), [quickInfo])}
    >
      <Element
        onScroll={(event) => {
          if (event.target instanceof HTMLElement) {
            scrollLeftOffset.current = event.target.scrollLeft
          }
          setQuickInfo(null)
        }}
        style={{
          display: inline ? 'inline-block' : 'block',
          paddingTop: paddingVertical,
          paddingBottom: paddingVertical,
          paddingLeft: paddingHorizontal,
          paddingRight: paddingHorizontal,
          overflow: 'auto',
        }}
      >
        {children}
      </Element>
      {quickInfo ? (
        <div
          style={{
            display: 'contents',
            [String('--scroll-left-offset')]: scrollLeftOffset.current + 'px',
          }}
        >
          {quickInfo.children}
        </div>
      ) : null}
    </QuickInfoContext.Provider>
  )
}
