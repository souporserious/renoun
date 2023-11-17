'use client'
import React, { useState } from 'react'

export function Symbol({
  children,
  style,
  isQuickInfoOpen,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  isQuickInfoOpen?: boolean
}) {
  const [hover, setHover] = useState(false)

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        pointerEvents: 'auto',
        position: 'absolute',
        backgroundColor: hover ? '#87add73d' : undefined,
        ...style,
      }}
    >
      {isQuickInfoOpen || hover ? children : null}
    </div>
  )
}
