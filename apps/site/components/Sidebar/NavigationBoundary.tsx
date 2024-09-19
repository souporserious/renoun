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
    <div
      css={{
        display: 'contents',
        '@media screen and (max-width: calc(60rem - 1px))': {
          '&[data-open=false]': {
            display: 'none',
          },
        },
        ...css,
      }}
      data-open={isNavigationOpen}
    >
      {children}
    </div>
  )
}
