import React from 'react'
import { GlobalStyles } from 'restyle'

import { getContext } from '../../utils/context.js'
import { getThemeColorVariables } from '../../utils/get-theme.js'
import { ServerConfigContext } from '../Config/ServerConfigContext.js'

/**
 * Injects the global CSS theme color variables used throughout `renoun/components`.
 * @internal
 */
export async function ThemeStyles() {
  const config = getContext(ServerConfigContext)
  const colorVariables = await getThemeColorVariables(config.theme)

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
