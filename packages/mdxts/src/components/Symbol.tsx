'use client'
import React, { useState, useEffect } from 'react'
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

  useEffect(() => {
    function handleScroll() {
      setHover(false)
    }
    document.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      document.removeEventListener('scroll', handleScroll)
    }
  }, [])

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
