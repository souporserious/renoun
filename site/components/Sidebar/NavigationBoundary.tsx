'use client'
import { useSignalValue } from 'hooks/useSignal'

import { isNavigationOpenSignal } from './NavigationToggle'
import styles from './NavigationBoundary.module.css'

export function NavigationBoundary({
  children,
}: {
  children: React.ReactNode
}) {
  const isNavigationOpen = useSignalValue(isNavigationOpenSignal)
  return (
    <div className={styles.container} data-open={isNavigationOpen}>
      {children}
    </div>
  )
}
