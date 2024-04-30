import { CSSProperties } from 'react'
import { createContext } from '../../utils/context'
import type { getTokens } from './get-tokens'

export const Context = createContext<{
  value: string
  tokens: Awaited<ReturnType<typeof getTokens>>
  filenameLabel?: string
  sourcePath?: string
  highlight?: string
  padding?: CSSProperties['padding']
} | null>(null)
