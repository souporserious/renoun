import { createContext } from '../utils/context'

export const Context = createContext<{
  theme?: any
  workingDirectory?: string
}>({
  theme: undefined,
  workingDirectory: undefined,
})
