import type { CSSProperties } from 'react'

import { createContext, getContext } from '../../utils/context.js'
import type { SourceTextMetadata } from '../../utils/get-source-text-metadata.js'

/** @internal */
export type ContextValue =
  | (Partial<SourceTextMetadata> & {
      allowErrors?: boolean | string
      showErrors?: boolean
      shouldAnalyze?: boolean
      shouldFormat?: boolean
      highlightedLines?: string
      padding?: CSSProperties['padding']
      baseDirectory?: string
      resolved?: Required<SourceTextMetadata>
      resolvers: PromiseWithResolvers<void>
    })
  | null

/**
 * Context for managing code block state.
 * @internal
 */
export const Context = createContext<ContextValue>(null)

/**
 * Resolved context value.
 * @internal
 */
export async function getResolvedContext() {
  const context = getContext(Context)

  if (context === null) {
    throw new Error(
      '[renoun] `getResolvedContext` must be used inside a `CodeBlock` component that specifies `Tokens`.'
    )
  }

  await context.resolvers.promise

  const {
    resolvers,
    resolved,
    value,
    language,
    filePath,
    label,
    ...restContext
  } = context

  return {
    ...resolved!,
    ...restContext,
  }
}
