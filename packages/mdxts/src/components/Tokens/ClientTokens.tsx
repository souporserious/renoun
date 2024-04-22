'use client'
import React, { use } from 'react'

import { RenderedTokens } from './RenderedTokens'
import { getTokens } from './get-tokens'
import type { TokensProps } from './types'

export function ClientTokens({
  renderLine,
  renderToken,
  ...props
}: TokensProps) {
  const tokens =
    'value' in props
      ? use(getTokens(props.filename, props.value, props.language))
      : props.tokens
  return (
    <RenderedTokens
      tokens={tokens}
      renderToken={renderToken}
      renderLine={renderLine}
    />
  )
}
