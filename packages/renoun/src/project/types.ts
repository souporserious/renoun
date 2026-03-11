import type { ProjectOptions as TsMorphProjectOptions } from '../utils/ts-morph.ts'

import type { Themes } from '../grammars/index.ts'

export type ProjectOptions = {
  /** Path to the theme used for syntax highlighting. */
  theme?: Themes | (string & {})

  /** The URL of the production site. */
  siteUrl?: string

  /** The git source used for source links. */
  gitSource?: string

  /** The branch used for source links. */
  gitBranch?: string

  /** The git host used for source links. */
  gitHost?: 'github' | 'gitlab' | 'bitbucket'

  /** A unique identifier that scopes analysis caches. */
  projectId?: string
} & Pick<
  TsMorphProjectOptions,
  'compilerOptions' | 'tsConfigFilePath' | 'useInMemoryFileSystem'
>
