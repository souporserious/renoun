import type { ProjectOptions as TsMorphProjectOptions } from 'ts-morph'

import type { Themes } from '../grammars/index.js'

export type ProjectOptions = {
  /** Path to the VS Code compatible theme used for syntax highlighting the `CodeBlock`, `CodeInline`, and `Tokens` components. */
  theme?: Themes | (string & {})

  /** The URL of the production site. This is used for generating sitemap and RSS feed URLs. */
  siteUrl?: string

  /** The git source to use for linking to the repository and source files. */
  gitSource?: string

  /** The branch to use for linking to the repository and source files. */
  gitBranch?: string

  /** The git host to use. This option disables the host detection from `gitSource` which is helpful for self-hosted instances. */
  gitHost?: 'github' | 'gitlab' | 'bitbucket'

  /** A unique identifier for the project. This is used to uniquely cache the project and its files. */
  projectId?: string
} & Pick<
  TsMorphProjectOptions,
  'compilerOptions' | 'tsConfigFilePath' | 'useInMemoryFileSystem'
>
