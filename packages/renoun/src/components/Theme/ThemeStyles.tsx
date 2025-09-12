import React from 'react'
import { GlobalStyles } from 'restyle'

import type { ConfigurationOptions } from '../Config/types.js'
import { getThemeColorVariables } from '../../utils/get-theme.js'

/**
 * Injects the global CSS theme color variables used throughout `renoun/components`.
 * @internal
 */
export async function ThemeStyles({
  theme,
}: {
  theme: ConfigurationOptions['theme']
}) {
  const colorVariables = await getThemeColorVariables(theme)

  return (
    <GlobalStyles>
      {{
        '[data-theme-disable-transitions] *': {
          transition: 'none !important',
        },
        ...colorVariables,
      }}
    </GlobalStyles>
  )
}
