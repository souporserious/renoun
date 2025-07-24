import { createContext } from '../utils/context.js'

/**
 * Manages passing the current tree's `baseDirectory` to descendant server components.
 * @internal
 */
export const BaseDirectoryContext = createContext<string | undefined>(undefined)
