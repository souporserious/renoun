'use client'
import React from 'react'
import { useQuickInfoContext } from './QuickInfoProvider'
import { keepElementInView } from './utils'

export function QuickInfoPopover({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const { quickInfo } = useQuickInfoContext()

  React.useLayoutEffect(() => {
    if (ref.current && quickInfo) {
      const popoverNode = ref.current.firstChild as HTMLElement
      const anchorNode = document.getElementById(quickInfo.anchorId)!
      const styles = keepElementInView(popoverNode, anchorNode)
      popoverNode.style.setProperty('top', styles.top + 'px')
      popoverNode.style.setProperty('left', styles.left + 'px')
      popoverNode.style.setProperty('width', styles.width + 'px')
      popoverNode.style.setProperty('height', styles.height + 'px')
      return () => {
        popoverNode.style.removeProperty('top')
        popoverNode.style.removeProperty('left')
        popoverNode.style.removeProperty('width')
        popoverNode.style.removeProperty('height')
      }
    }
  }, [])

  return (
    <div ref={ref} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
