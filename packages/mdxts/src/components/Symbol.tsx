'use client'
import React, { useContext, useState, useEffect } from 'react'
import { usePreContext } from './Pre'
import { QuickInfoContext } from './QuickInfoContainer'

export function Symbol({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  isQuickInfoOpen?: boolean
}) {
  const setQuickInfo = useContext(QuickInfoContext)

  if (!setQuickInfo) {
    throw new Error('Symbol must be used within a QuickInfoContainer')
  }

  const [hover, setHover] = useState(false)

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
    <span
      onPointerEnter={() => setQuickInfo(children)}
      onPointerLeave={() => setQuickInfo(null)}
      onPointerCancel={() => setQuickInfo(null)}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: hover ? '#87add73d' : undefined,
        ...style,
      }}
    />
  )
}
