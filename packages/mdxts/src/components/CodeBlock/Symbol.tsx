'use client'
import React, { useEffect, useId, useRef } from 'react'

import { useQuickInfoContext } from './QuickInfoProvider'
import { getClosestViewport } from './utils'

export function Symbol({
  popover,
  children,
  highlightColor = '#87add7',
  className,
  style,
}: {
  popover: React.ReactNode
  children: React.ReactNode
  highlightColor?: string
  className?: string
  style?: React.CSSProperties
}) {
  const anchorId = useId()
  const symbolRef = useRef<HTMLSpanElement>(null)
  const { quickInfo, setQuickInfo, resetQuickInfo } = useQuickInfoContext()
  const isHighlighted = quickInfo?.anchorId === anchorId

  useEffect(() => {
    if (symbolRef.current && quickInfo) {
      function handleScroll() {
        resetQuickInfo(true)
      }
      const viewport = getClosestViewport(symbolRef.current)
      viewport.addEventListener('scroll', handleScroll, { passive: true })
      window.addEventListener('scroll', handleScroll, { passive: true })
      return () => {
        viewport.removeEventListener('scroll', handleScroll)
        window.removeEventListener('scroll', handleScroll)
      }
    }
  }, [quickInfo])

  return (
    <span
      id={anchorId}
      ref={symbolRef}
      onPointerEnter={() => {
        setQuickInfo({ anchorId, popover })
      }}
      onPointerLeave={() => {
        resetQuickInfo()
      }}
      onPointerCancel={() => {
        resetQuickInfo()
      }}
      className={className}
      style={{
        backgroundColor: isHighlighted ? highlightColor : undefined,
        ...style,
      }}
    >
      {children}
    </span>
  )
}
