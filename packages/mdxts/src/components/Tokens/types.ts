import { type RenderedTokensProps } from './RenderedTokens'

export type TokenProps = {
  value: string
  startIndex: number
  endIndex: number
  backgroundColor: string
  color: string
  fontStyle: string
  fontWeight: string
  textDecoration: string
}

export type TokensProps =
  | RenderedTokensProps
  | ({
      value: string
      language: string
      theme: string
    } & Omit<RenderedTokensProps, 'tokens'>)
