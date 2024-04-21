import React from 'react'
import 'server-only'

import { RenderedTokens } from './RenderedTokens'
import { getTokens } from './utils'
import type { TokensProps } from './types'

export async function ServerTokens({
  value,
  language,
  theme,
  renderLine,
  renderToken,
}: TokensProps) {
  const { tokens } = await getTokens({ value, language, theme })
  return (
    <RenderedTokens
      tokens={tokens}
      renderToken={renderToken}
      renderLine={renderLine}
    />
  )
}
