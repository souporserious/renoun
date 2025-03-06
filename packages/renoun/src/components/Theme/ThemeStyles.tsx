import React from 'react'
import { GlobalStyles } from 'restyle'

import { getThemeColorVariables } from '../../utils/get-theme.js'

/** A component that sets the global theme colors. */
export async function ThemeStyles() {
  const colorVariables = await getThemeColorVariables()
  return <GlobalStyles>{colorVariables}</GlobalStyles>
}
