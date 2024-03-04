'use client'
import { useState } from 'react'
import { Box } from './Box'

import styles from './PageContainer.module.css'

export function PageContainer({
  className,
  children,
}: {
  className: string
  children: React.ReactNode
}) {
  const [active, setActive] = useState(false)
  return (
    <div data-active={active} className={styles.container}>
      <main className={className}>{children}</main>
      <button
        title={`Toggle perspective ${active ? 'on' : 'off'}`}
        className={styles.toggle}
        onClick={() => {
          setActive(!active)
        }}
      >
        <Box />
      </button>
    </div>
  )
}
