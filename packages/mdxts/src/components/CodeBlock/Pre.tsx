import React from 'react'

import { getTheme } from './get-theme'

export function Pre({
  className,
  style,
  children,
}: {
  children?: React.ReactNode

  /** Class name to apply to the code block. */
  className?: string

  /** Style to apply to the code block. */
  style?: React.CSSProperties
}) {
  const theme = getTheme()

  return (
    <pre
      className={className}
      style={{
        lineHeight: 1.4,
        whiteSpace: 'pre',
        wordWrap: 'break-word',
        overflow: 'auto',
        position: 'relative',
        backgroundColor: theme.background,
        color: theme.foreground,
        boxShadow: `0 0 0 1px ${theme.colors['panel.border']}70`,
        borderRadius: 5,
        ...style,
      }}
    >
      {children}
    </pre>
  )
}
