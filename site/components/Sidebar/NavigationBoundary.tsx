'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useSignalValue } from 'hooks/useSignal'

import { isNavigationOpenSignal } from './NavigationToggle'
import styles from './NavigationBoundary.module.css'

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
    <div className={styles.container} data-open={isNavigationOpen}>
      {children}
    </div>
  )
}
