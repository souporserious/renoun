'use client'
import { useState } from 'react'

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
        onClick={() => {
          setActive(!active)
        }}
        style={{
          position: 'absolute',
          bottom: '2rem',
          right: '2rem',
          zIndex: 1,
          border: 'none',
          background: 'transparent',
        }}
      >
        <svg width="27" height="31" viewBox="0 0 27 31" fill="none">
          <path
            d="M1 8.05405L13.3106 1L26 6.48649V22.9459L13.3106 30L1 24.5135V8.05405Z"
            fill="#D9D9D9"
            fillOpacity="0.2"
          />
          <path
            d="M1 8.05405L13.3106 1M1 8.05405L13.3106 13.5405M1 8.05405V24.5135M13.3106 1L26 6.48649M13.3106 1V17.4595M26 6.48649L13.3106 13.5405M26 6.48649V22.9459M13.3106 13.5405V30M1 24.5135L13.3106 17.4595M1 24.5135L13.3106 30M13.3106 17.4595L26 22.9459M26 22.9459L13.3106 30"
            stroke="white"
            strokeOpacity="0.4"
          />
        </svg>
      </button>
    </main>
  )
}
