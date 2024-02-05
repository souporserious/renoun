'use client'
import React, { useId, useState } from 'react'
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
  const { quickInfo, setQuickInfo, resetQuickInfo, clearTimeout } =
    useQuickInfoContext()
  const [hover, setHover] = useState(false)

  return (
    <span
      id={anchorId}
      onPointerEnter={() => {
        clearTimeout()
        setQuickInfo({ anchorId, children })
        setHover(true)
      }}
      onPointerLeave={() => {
        resetQuickInfo()
        setHover(false)
      }}
      onPointerCancel={() => {
        resetQuickInfo()
        setHover(false)
      }}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: quickInfo && hover ? '#87add73d' : undefined,
        ...style,
      }}
    />
  )
}
