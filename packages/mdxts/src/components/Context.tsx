import { createContext } from '../utils/context'

export const Context = createContext<{
  workingDirectory?: string
}>({
  workingDirectory: undefined,
})
