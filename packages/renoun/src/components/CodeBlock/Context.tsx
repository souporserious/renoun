import { CSSProperties } from 'react'
import { createContext } from '../../utils/context.js'
import type { getTokens } from '../../utils/get-tokens.js'

export type ContextValue = {
  value: string
  tokens: Awaited<ReturnType<typeof getTokens>>
  filenameLabel?: string
  highlightedLines?: string
  padding?: CSSProperties['padding']
} | null

export const Context = createContext<ContextValue>(null)
