'use client'
import React, { useState } from 'react'
import { usePreContext } from './Pre'

export function Symbol({
  children,
  style,
  isQuickInfoOpen,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  isQuickInfoOpen?: boolean
}) {
  const preContext = usePreContext()
  const [hover, setHover] = useState(false)
  const shouldRenderChildren = preContext ? false : isQuickInfoOpen || hover

  return (
    <div
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerCancel={() => setHover(false)}
      style={{
        pointerEvents: preContext ? 'none' : 'auto',
        position: 'absolute',
        backgroundColor: hover ? '#87add73d' : undefined,
        ...style,
      }}
    >
      {shouldRenderChildren ? children : null}
    </div>
  )
}
