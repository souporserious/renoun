'use client'
import React, { createContext, useState } from 'react'

export const PreHoverContext = createContext<boolean | null>(null)

function isTargetValid(event: React.PointerEvent<HTMLPreElement>) {
  if (
    event.target instanceof HTMLElement ||
    event.target instanceof SVGElement
  ) {
    const hasButton = event.target.closest('button')
    if (hasButton) {
      return false
    }

    const hasAnchor = event.target.closest('a')
    if (hasAnchor) {
      return false
    }
  }

  return true
}

export function Pre({
  children,
  className,
  style,
  ...props
}: React.ComponentProps<'pre'>) {
  const [hover, setHover] = useState(false)

  return (
    <pre
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerDown={(event) => isTargetValid(event) && setHover(false)}
      className={className}
      style={{
        whiteSpace: 'pre',
        wordWrap: 'break-word',
        overflow: 'auto',
        position: 'relative',
        ...style,
      }}
      {...props}
    >
      <PreHoverContext.Provider value={hover}>
        {children}
      </PreHoverContext.Provider>
    </pre>
  )
}
