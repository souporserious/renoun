'use client'
import { useState } from 'react'
import { Box } from './Box'

export function PageContainer({
  className,
  children,
}: {
  className: string
  children: React.ReactNode
}) {
  const [active, setActive] = useState(false)
  return (
    <main className={className} data-active={active}>
      {children}
      <button
        title={`Toggle perspective ${active ? 'on' : 'off'}`}
        onClick={() => {
          setActive(!active)
        }}
        style={{
          position: 'absolute',
          bottom: '4rem',
          right: '3.5rem',
          zIndex: 1,
          border: 'none',
          background: 'transparent',
        }}
      >
        <Box />
      </button>
    </main>
  )
}
