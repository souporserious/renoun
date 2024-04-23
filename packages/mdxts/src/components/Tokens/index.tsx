import React from 'react'

// import { ClientTokens } from './ClientTokens'
import { RenderedTokens } from './RenderedTokens'
import type { TokensProps } from './types'

export type { TokenProps, TokensProps } from './types'

export function Tokens(props: TokensProps) {
  if ('tokens' in props) {
    return <RenderedTokens {...props} />
  }
  console.log('Tokens Component: ', { props })
  return null
  // if (typeof window === 'undefined') {
  //   return import('./ServerTokens').then(({ ServerTokens }) => (
  //     <ServerTokens {...props} />
  //   ))
  // }
  // return <ClientTokens {...props} />
}
