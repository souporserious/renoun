import { createContext } from '../utils/context.js'

/**
 * Manages passing the current tree's `workingDirectory` to descendant Server Components.
 * @internal
 */
export const Context = createContext<{
  workingDirectory?: string
}>({
  workingDirectory: undefined,
})
