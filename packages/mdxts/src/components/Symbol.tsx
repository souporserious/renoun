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
  const { quickInfo, setQuickInfo } = useQuickInfoContext()
  const [hover, setHover] = useState(false)

  return (
    <span
      id={anchorId}
      onPointerEnter={() => {
        setQuickInfo({ anchorId, children })
        setHover(true)
      }}
      onPointerLeave={() => {
        setQuickInfo(null)
        setHover(false)
      }}
      onPointerCancel={() => {
        setQuickInfo(null)
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
