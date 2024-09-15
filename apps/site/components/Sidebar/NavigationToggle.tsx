'use client'
import { signal } from '@preact/signals-core'

import { useSignalValue } from 'hooks/use-signal-value'

export const isNavigationOpenSignal = signal(false)

export function NavigationToggle() {
  const isNavigationOpen = useSignalValue(isNavigationOpenSignal)
  return (
    <button
      css={{
        width: '24px',
        height: '24px',
        padding: 0,
        marginLeft: 'auto',
        background: 'none',
        border: 'none',
        color: 'white',
        '@media screen and (min-width: 60rem)': {
          display: 'none',
        },
      }}
      onClick={() => {
        isNavigationOpenSignal.value = !isNavigationOpenSignal.value
      }}
    >
      {isNavigationOpen ? <CloseIcon /> : <MenuIcon />}
    </button>
  )
}

function CloseIcon() {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      style={{
        width: 'var(--font-size-body-1)',
        height: 'var(--font-size-body-1)',
      }}
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      style={{
        width: 'var(--font-size-body-1)',
        height: 'var(--font-size-body-1)',
      }}
    >
      <path d="M3 12h18" />
      <path d="M3 6h18" />
      <path d="M3 18h18" />
    </svg>
  )
}
