'use client'
import React, { createContext, useContext, useState } from 'react'

const PreContext = createContext(false)

export function usePreContext() {
  return useContext(PreContext)
}

export function Pre({ children, ...props }: React.HTMLProps<HTMLPreElement>) {
  const [pointerDown, setPointerDown] = useState(false)
  return (
    <pre
      {...props}
      onPointerDown={() => setPointerDown(true)}
      onPointerUp={() => setPointerDown(false)}
      onPointerCancel={() => setPointerDown(false)}
      style={{
        gridColumn: 2,
        gridRow: 1,
        whiteSpace: 'pre',
        wordWrap: 'break-word',
        fontSize: 14,
        lineHeight: '20px',
        letterSpacing: '0px',
        tabSize: 4,
        padding: 0,
        margin: 0,
        borderRadius: 4,
        // pointerEvents: 'none', // TODO: toggle if nested in Editor
        position: 'relative',
        overflow: 'visible',
        ...props.style,
      }}
    >
      <PreContext.Provider value={pointerDown}>{children}</PreContext.Provider>
    </pre>
  )
}
