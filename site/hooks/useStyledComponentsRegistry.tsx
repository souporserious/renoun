import React, { useState } from 'react'
import { ServerStyleSheet, StyleSheetManager } from 'styled-components'

type ChildProps = { children: React.ReactNode }

export function useStyledComponentsRegistry() {
  const [styledComponentsStyleSheet] = useState(() => new ServerStyleSheet())

  const styledComponentsFlushEffect = () => {
    const styles = styledComponentsStyleSheet.getStyleElement()
    styledComponentsStyleSheet.instance.clearTag()
    return <>{styles}</>
  }

  function StyledComponentsRegistry({ children }: ChildProps) {
    if (typeof window !== 'undefined') return <>{children}</>
    return (
      <StyleSheetManager sheet={styledComponentsStyleSheet.instance}>
        {children as React.ReactChild}
      </StyleSheetManager>
    )
  }

  return [StyledComponentsRegistry, styledComponentsFlushEffect] as const
}
