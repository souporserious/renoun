'use client'
import React, { useContext, useEffect, useId, useRef, useState } from 'react'

import { PreActiveContext } from './Pre.js'
import { useQuickInfoContext } from './QuickInfoProvider.js'
import { getClosestViewport } from './utils.js'

/**
 * A symbol that can display a popover when hovered.
 * @internal
 */
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
  const preActive = useContext(PreActiveContext)
  const { quickInfo, setQuickInfo, resetQuickInfo } = useQuickInfoContext()
  const isHighlighted = quickInfo?.anchorId === anchorId
  const [isInitialHighlight, setIsInitialHighlight] = useState(false)

  useEffect(() => {
    if (preActive) {
      setIsInitialHighlight(true)

      const timeoutId = setTimeout(() => {
        setIsInitialHighlight(false)
      }, 600)

      return () => {
        clearTimeout(timeoutId)
        setIsInitialHighlight(false)
      }
    }
  }, [preActive])

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

  const shouldHighlight = isInitialHighlight || isHighlighted

  return (
    <span
      id={anchorId}
      ref={symbolRef}
      onPointerEnter={() => {
        setQuickInfo({ anchorId, popover })
      }}
      onPointerDown={() => {
        resetQuickInfo()
      }}
      onPointerLeave={() => {
        resetQuickInfo()
      }}
      onPointerCancel={() => {
        resetQuickInfo()
      }}
      className={className}
      style={{
        backgroundColor: shouldHighlight ? highlightColor : undefined,
        transition: 'background-color 200ms',
        ...style,
      }}
    >
      {children}
    </span>
  )
}
