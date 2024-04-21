'use client'
import React, { use } from 'react'

import { RenderedTokens } from './RenderedTokens'
import { getTokens } from './utils'
import type { TokensProps } from './types'

export function ClientTokens({
  value,
  language,
  theme,
  renderLine,
  renderToken,
}: TokensProps) {
  const { tokens } = use(getTokens({ value, language, theme }))
  return (
    <RenderedTokens
      tokens={tokens}
      renderToken={renderToken}
      renderLine={renderLine}
    />
  )
}
