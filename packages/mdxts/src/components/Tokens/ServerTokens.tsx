import React from 'react'
import 'server-only'

import { RenderedTokens } from './RenderedTokens'
import { getTokens } from './get-tokens'
import type { TokensProps } from './types'

export async function ServerTokens({
  renderLine,
  renderToken,
  ...props
}: TokensProps) {
  const tokens =
    'filename' in props
      ? await getTokens(props.value, props.language, props.filename)
      : props.tokens
  return (
    <RenderedTokens
      tokens={tokens}
      renderToken={renderToken}
      renderLine={renderLine}
    />
  )
}
