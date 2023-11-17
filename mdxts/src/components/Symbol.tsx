'use client'
import React, { useState } from 'react'

export function Symbol({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
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
      {hover ? children : null}
    </div>
  )
}
