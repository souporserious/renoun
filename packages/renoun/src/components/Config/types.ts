import type { Languages, Themes } from '../../grammars/index.js'

/**
 * The theme name.
 * @internal
 */
export type ThemeName = Themes | (string & {})

/**
 * The theme override.
 * @internal
 */
export type ThemeOverride = {
  colors?: Record<string, string>
  tokenColors?: any[]
  semanticTokenColors?: Record<string, any>
  settings?: any[]
  type?: 'light' | 'dark'
  [key: string]: any
}

/**
 * The theme value.
 * @internal
 */
export type ThemeValue = ThemeName | [ThemeName, ThemeOverride]

/**
 * The git host.
 * @internal
 */
export type GitHost = 'github' | 'gitlab' | 'bitbucket' | 'pierre'

/**
 * The configuration options for git linking.
 * @internal
 */
export type GitConfig = {
  /** The git source to use for linking to the repository and source files. */
  source: string

  /** The branch to use for linking to the repository and source files. */
  branch: string

  /** The git host to use. This option disables the host detection from `git.source` which is helpful for self-hosted instances. */
  host: 'github' | 'gitlab' | 'bitbucket' | 'pierre'

  /** The owner of the repository. */
  owner: string

  /** The repository name. */
  repository: string

  /** The base URL of the Git host. */
  baseUrl: string
}

/**
 * The configuration options.
 * @internal
 */
export interface ConfigurationOptions {
  /** Path to the VS Code compatible theme used for syntax highlighting the `CodeBlock`, inline `Code`, and `Tokens` components. */
  theme?: ThemeValue | Record<string, ThemeValue>

  /** List of languages to load for syntax highlighting. */
  languages: Languages[]

  /** Configuration options for git linking. */
  git?: GitConfig

  /** The URL of the production site. This is used for generating sitemap and RSS feed URLs. */
  siteUrl?: string

  /** The default package manager used by the `Install` component. */
  defaultPackageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun'
}
