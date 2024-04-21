import React from 'react'

import { ClientTokens } from './ClientTokens'
import type { TokensProps } from './types'

export { RenderedTokens } from './RenderedTokens'
export { getTokens, getTheme } from './utils'
export type { TokenProps, TokensProps } from './types'

export function Tokens(props: TokensProps) {
  if (typeof window === 'undefined') {
    return import('./ServerTokens').then(({ ServerTokens }) => (
      <ServerTokens {...props} />
    ))
  }
  return <ClientTokens {...props} />
}
