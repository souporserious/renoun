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
    if (!ref.current || !quickInfo) {
      return
    }

    const popoverNode = ref.current.firstElementChild
    if (!(popoverNode instanceof HTMLElement)) {
      return
    }

    const anchorNode = document.getElementById(quickInfo.anchorId)
    if (!(anchorNode instanceof HTMLElement)) {
      return
    }

    keepElementInView(popoverNode, anchorNode)

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            keepElementInView(popoverNode, anchorNode)
          })
    resizeObserver?.observe(popoverNode)

    return () => {
      resizeObserver?.disconnect()
      popoverNode.style.removeProperty('top')
      popoverNode.style.removeProperty('left')
      popoverNode.style.removeProperty('width')
      popoverNode.style.removeProperty('height')
    }
  }, [children, quickInfo])

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
