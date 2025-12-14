import { createContext } from '../utils/context.tsx'

/**
 * Manages passing the current tree's `baseDirectory` to descendant server components.
 * @internal
 */
export const BaseDirectoryContext = createContext<string | undefined>(undefined)
