import { createContext } from '../utils/context.js'

/**
 * Manages passing the current tree's `workingDirectory` to descendant server components.
 * @internal
 */
export const WorkingDirectoryContext = createContext<string | undefined>(
  undefined
)
