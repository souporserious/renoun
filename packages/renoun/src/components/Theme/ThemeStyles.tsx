import React from 'react'
import { GlobalStyles } from 'restyle'

import {
  BASE_TOKEN_CLASS_NAME,
  getThemeColorVariables,
  getThemeTokenVariables,
} from '../../utils/get-theme.ts'
import type { ConfigurationOptions } from '../Config/types.ts'

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
        [`.${BASE_TOKEN_CLASS_NAME}`]: {
          color: 'var(--0)',
          fontStyle: 'var(--00)',
          fontWeight: 'var(--01)',
          textDecoration: 'var(--02)',
        },
        ...getThemeTokenVariables(theme),
        ...colorVariables,
      }}
    </GlobalStyles>
  )
}
