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
      Object.keys(styles).forEach((key) =>
        popoverNode.style.setProperty(
          key,
          styles[key as keyof typeof styles] + 'px'
        )
      )
    }
  }, [])

  return (
    <div ref={ref} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
