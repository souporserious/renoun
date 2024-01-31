'use client'
import React, { useState } from 'react'
import { useQuickInfoContext } from './QuickInfoContainer'

export function Symbol({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  isQuickInfoOpen?: boolean
}) {
  const { quickInfo, setQuickInfo } = useQuickInfoContext()
  const [hover, setHover] = useState(false)

  return (
    <span
      onPointerEnter={() => {
        setQuickInfo(children)
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
