'use client'
import React from 'react'

export const QuickInfoContext = React.createContext<React.Dispatch<
  React.SetStateAction<React.ReactNode>
> | null>(null)

export function QuickInfoContainer({
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
  const [quickInfo, setQuickInfo] = React.useState<React.ReactNode>(null)
  const Element = inline ? 'span' : 'div'
  return (
    <QuickInfoContext.Provider value={setQuickInfo}>
      <Element
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
      {quickInfo}
    </QuickInfoContext.Provider>
  )
}
