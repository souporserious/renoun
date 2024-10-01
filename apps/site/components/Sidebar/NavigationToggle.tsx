'use client'
import { signal, effect } from '@preact/signals-core'

import { useSignalValue } from 'hooks/use-signal-value'
import type { CSSObject } from 'restyle'

export const isNavigationOpenSignal = signal(false)

if (typeof document !== 'undefined') {
  effect(() => {
    document.body.style.overflow = isNavigationOpenSignal.value ? 'hidden' : ''
  })
}

export function NavigationToggle({ css }: { css?: CSSObject }) {
  const isNavigationOpen = useSignalValue(isNavigationOpenSignal)

  return (
    <button
      css={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 'var(--font-size-body-1)',
        height: 'var(--font-size-body-1)',
        padding: 0,
        marginLeft: 'auto',
        background: 'none',
        border: 'none',
        color: 'white',
        ...css,
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
      css={{
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
      css={{
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
