'use client'
import React, { useId } from 'react'
import { useQuickInfoContext } from './QuickInfoProvider'

export function Symbol({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  isQuickInfoOpen?: boolean
}) {
  const anchorId = useId()
  const { quickInfo, setQuickInfo, resetQuickInfo } = useQuickInfoContext()
  const isHighlighted = quickInfo?.anchorId === anchorId

  return (
    <span
      id={anchorId}
      onPointerEnter={() => {
        setQuickInfo({ anchorId, children })
      }}
      onPointerLeave={() => {
        resetQuickInfo()
      }}
      onPointerCancel={() => {
        resetQuickInfo()
      }}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: isHighlighted ? '#87add73d' : undefined,
        ...style,
      }}
    />
  )
}
