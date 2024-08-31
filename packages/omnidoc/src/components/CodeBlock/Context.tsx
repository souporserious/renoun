import { CSSProperties } from 'react'
import { createContext } from '../../utils/context'
import type { getTokens } from '../../utils/get-tokens'

export type ContextValue = {
  value: string
  tokens: Awaited<ReturnType<typeof getTokens>>
  filenameLabel?: string
  highlightedLines?: string
  padding?: CSSProperties['padding']
} | null

export const Context = createContext<ContextValue>(null)
