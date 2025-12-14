'use client'
import React from 'react'

import { keepElementInView } from './utils.ts'
import { useQuickInfoContext } from './QuickInfoProvider.tsx'

/**
 * A popover that displays quick info.
 * @internal
 */
export function QuickInfoPopover({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const { quickInfo, resetQuickInfo, clearTimeouts } = useQuickInfoContext()

  React.useLayoutEffect(() => {
    if (ref.current && quickInfo) {
      const popoverNode = ref.current.firstChild as HTMLElement
      const anchorNode = document.getElementById(quickInfo.anchorId)!
      keepElementInView(popoverNode, anchorNode)
      return () => {
        popoverNode.style.removeProperty('top')
        popoverNode.style.removeProperty('left')
        popoverNode.style.removeProperty('width')
        popoverNode.style.removeProperty('height')
      }
    }
  }, [quickInfo])

  return (
    <div
      ref={ref}
      onPointerOver={() => {
        clearTimeouts()
      }}
      onPointerLeave={() => {
        resetQuickInfo()
      }}
      onPointerCancel={() => {
        resetQuickInfo()
      }}
      style={{ display: 'contents' }}
    >
      {children}
    </div>
  )
}
