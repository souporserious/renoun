'use client'
import React, { createContext, useState } from 'react'

export const PreActiveContext = createContext<boolean | null>(null)

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
  const [active, setActive] = useState(false)
  const handleFocus = () => setActive(true)
  const handleBlur = (event: React.FocusEvent<HTMLPreElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return
    }
    setActive(false)
  }
  const handlePointerEnter = () => setActive(true)
  const handlePointerLeave = () => setActive(false)
  const handlePointerDown = (event: React.PointerEvent<HTMLPreElement>) => {
    if (isTargetValid(event)) {
      setActive(false)
    }
  }

  return (
    <pre
      tabIndex={0}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      className={className}
      style={style}
      {...props}
    >
      <PreActiveContext.Provider value={active}>
        {children}
      </PreActiveContext.Provider>
    </pre>
  )
}
