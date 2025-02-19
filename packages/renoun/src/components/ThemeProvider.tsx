import React from 'react'
import { GlobalStyles } from 'restyle'

import { getThemeColorVariables } from '../utils/get-theme'

/** A provider that sets the theme colors for the entire application. */
export async function ThemeProvider() {
  const colorVariables = await getThemeColorVariables()
  return <GlobalStyles>{colorVariables}</GlobalStyles>
}
