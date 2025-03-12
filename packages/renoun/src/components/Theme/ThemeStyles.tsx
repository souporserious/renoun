import React from 'react'
import { GlobalStyles } from 'restyle'

import { getThemeColorVariables } from '../../utils/get-theme.js'

/**
 * Injects the global CSS theme color variables used throughout `renoun/components`.
 *
 * This component is automatically included in the `ThemeProvider` component.
 * Only use this component if you are managing the theme yourself.
 */
export async function ThemeStyles() {
  const colorVariables = await getThemeColorVariables()
  return <GlobalStyles>{colorVariables}</GlobalStyles>
}
