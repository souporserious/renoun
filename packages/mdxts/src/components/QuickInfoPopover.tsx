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

      const debugNode = document.createElement('div')
      debugNode.style.display = 'grid'
      debugNode.style.placeItems = 'center'
      debugNode.style.position = 'absolute'
      debugNode.style.zIndex = '9999'
      debugNode.style.left = styles.left + 'px'
      debugNode.style.top = styles.top + 'px'
      debugNode.style.width = styles.width + 'px'
      debugNode.style.height = styles.height + 'px'
      debugNode.style.backgroundColor = 'rgba(255, 0, 0, 0.5)'
      const width = styles.width.toFixed(2)
      const height = styles.height.toFixed(2)
      debugNode.innerHTML = `${width} x ${height}`
      document.body.appendChild(debugNode)

      return () => {
        debugNode.remove()
      }
    }
  }, [])

  return (
    <div ref={ref} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
