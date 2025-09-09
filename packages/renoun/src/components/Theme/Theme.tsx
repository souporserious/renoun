import React from 'react'

import { getContext } from '../../utils/context.js'
import { ServerConfigContext } from '../Config/ServerConfigContext.js'
import { ThemeContextProvider } from './ThemeContext.js'
import { ThemeScript } from './ThemeScript.js'
import { ThemeStyles } from './ThemeStyles.js'

/**
 * A provider that sets the theme colors for the entire application.
 * @internal
 */
export function ThemeProvider({
  children,
  includeScript = true,
  nonce,
}: {
  children: React.ReactNode
  includeScript?: boolean
  nonce?: string
}) {
  const config = getContext(ServerConfigContext)

  return (
    <>
      {includeScript ? <ThemeScript nonce={nonce} /> : null}
      <ThemeStyles />
      <ThemeContextProvider value={config.theme}>
        {children}
      </ThemeContextProvider>
    </>
  )
}
