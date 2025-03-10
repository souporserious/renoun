import type { CSSProperties } from 'react'

import type { Languages } from '../../utils/get-language.js'
import { createContext } from '../../utils/context.js'

/** @internal */
export type ContextValue = {
  value: string
  language: Languages
  filePath: string
  label?: string
  allowErrors?: boolean | string
  showErrors?: boolean
  highlightedLines?: string
  padding?: CSSProperties['padding']
  resolvers: PromiseWithResolvers<void>
} | null

/**
 * Context for managing code block state.
 * @internal
 */
export const Context = createContext<ContextValue>(null)
