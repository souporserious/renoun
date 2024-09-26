'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import type { CSSObject } from 'restyle'

import { useSignalValue } from 'hooks/use-signal-value'
import { isNavigationOpenSignal } from './NavigationToggle'

function useIsNavigationOpen() {
  const pathname = usePathname()
  const previousPathname = useRef<string>()
  const isNavigationOpen = useSignalValue(isNavigationOpenSignal)

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      isNavigationOpenSignal.value = false
    }
    previousPathname.current = pathname
  }, [pathname])

  return isNavigationOpen
}

export function NavigationBoundary({
  css,
  children,
}: {
  css?: CSSObject
  children: React.ReactNode
}) {
  const isNavigationOpen = useIsNavigationOpen()

  return (
    <aside
      css={{
        pointerEvents: 'none',
        position: 'fixed',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: 'var(--grid-template-columns)',

        '@media screen and (max-width: calc(60rem - 1px))': {
          marginTop: 'var(--header-height)',
          backgroundColor: 'var(--color-background)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          zIndex: 1,

          '&[data-open=false]': {
            display: 'none',
          },
        },
        ...css,
      }}
      data-open={isNavigationOpen}
    >
      {children}
    </aside>
  )
}
