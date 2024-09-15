'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

import { useSignalValue } from 'hooks/use-signal-value'
import { isNavigationOpenSignal } from './NavigationToggle'

export function NavigationBoundary({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const previousPathname = useRef<string>()
  const isNavigationOpen = useSignalValue(isNavigationOpenSignal)

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      isNavigationOpenSignal.value = false
    }
    previousPathname.current = pathname
  }, [pathname])

  return (
    <div
      css={{
        gridArea: '1 / 1',
        display: 'flex',
        flexDirection: 'column',
        gap: '4rem',
        '&[data-open="false"]': {
          display: 'none',
        },
        '@media screen and (min-width: 60rem)': {
          '&[data-open="false"]': {
            display: 'flex',
          },
        },
      }}
      data-open={isNavigationOpen}
    >
      {children}
    </div>
  )
}
