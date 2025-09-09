import { createContext } from '../../utils/context.js'
import type { ConfigurationOptions } from './ConfigTypes.js'
import { defaultConfig } from './ConfigTypes.js'

export const ServerConfigContext =
  createContext<ConfigurationOptions>(defaultConfig)
