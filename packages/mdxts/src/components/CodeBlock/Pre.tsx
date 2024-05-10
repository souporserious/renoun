'use client'
import React, { createContext, useState } from 'react'

export const PreHoverContext = createContext<boolean | null>(null)

export function Pre({
  children,
  className,
  style,
  ...props
}: React.ComponentProps<'pre'>) {
  const [hover, setHover] = useState(false)

  return (
    <pre
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
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
