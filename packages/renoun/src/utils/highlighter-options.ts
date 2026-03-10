import type { Languages, Themes } from '../grammars/index.ts'

export type ThemeName = Themes | (string & {})

export type ThemeOverride = {
  colors?: Record<string, string>
  tokenColors?: any[]
  semanticTokenColors?: Record<string, any>
  settings?: any[]
  type?: 'light' | 'dark'
  [key: string]: any
}

export type ThemeValue = ThemeName | [ThemeName, ThemeOverride]

export type ThemeConfig = ThemeValue | Record<string, ThemeValue>

export interface HighlighterInitializationOptions {
  theme?: ThemeConfig
  languages?: Languages[]
}
