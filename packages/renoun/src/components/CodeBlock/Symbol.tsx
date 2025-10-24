'use client'
import React, { useEffect, useId, useRef } from 'react'

import { useQuickInfoContext } from './QuickInfoProvider.js'
import { getScrollableAncestors } from './utils.js'

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
  const { quickInfo, setQuickInfo, resetQuickInfo } = useQuickInfoContext()
  const isHighlighted = quickInfo?.anchorId === anchorId

  useEffect(() => {
    if (symbolRef.current && quickInfo) {
      function handleScroll() {
        resetQuickInfo(true)
      }
      const controller = new AbortController()
      const scrollTargets = getScrollableAncestors(symbolRef.current)
      scrollTargets.forEach((target) => {
        target.addEventListener('scroll', handleScroll, {
          passive: true,
          signal: controller.signal,
        })
      })
      return () => {
        controller.abort()
      }
    }
  }, [quickInfo, resetQuickInfo])

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
        backgroundColor: isHighlighted ? highlightColor : undefined,
        ...style,
      }}
    >
      {children}
    </span>
  )
}
