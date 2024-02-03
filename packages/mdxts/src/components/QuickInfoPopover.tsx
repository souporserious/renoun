'use client'
import React from 'react'
import { useQuickInfoContext } from './QuickInfoProvider'
import { keepElementInView } from './utils'

export function QuickInfoPopover({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const { quickInfo } = useQuickInfoContext()

  React.useLayoutEffect(() => {
    if (quickInfo && ref.current) {
      const popoverNode = ref.current.firstChild as HTMLElement
      const anchorNode = document.getElementById(quickInfo.anchorId)!
      const styles = keepElementInView(popoverNode, anchorNode)
      popoverNode.style.width = styles.width + 'px'
      popoverNode.style.height = styles.height + 'px'
      popoverNode.style.top = styles.top + 'px'
      popoverNode.style.left = styles.left + 'px'
    }
  }, [])

  return (
    <div ref={ref} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
