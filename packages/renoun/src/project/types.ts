import type { bundledThemes } from 'shiki/bundle/web'
import type { ProjectOptions as TsMorphProjectOptions } from 'ts-morph'

export type ProjectOptions = {
  /** Path to the VS Code compatible theme used for syntax highlighting the `CodeBlock`, `CodeInline`, and `Tokens` components. */
  theme?: keyof typeof bundledThemes | (string & {})

  /** The URL of the production site. This is used for generating sitemap and RSS feed URLs. If using Vercel, the `VERCEL_PROJECT_PRODUCTION_URL` [environment variable](https://vercel.com/docs/projects/environment-variables/system-environment-variables) will be used by default. */
  siteUrl?: string

  /** The git source to use for linking to the repository and source files. This is automatically inferred from the git remote URL or [Vercel environment variables](https://vercel.com/docs/projects/environment-variables/system-environment-variables) if not provided. */
  gitSource?: string

  /** The branch to use for linking to the repository and source files. */
  gitBranch?: string

  /** The git provider to use. This option disables the provider detection from the `gitSource` which is helpful for self-hosted instances. */
  gitProvider?: 'github' | 'gitlab' | 'bitbucket'

  /** A unique identifier for the project. This is used to uniquely cache the project and its files. */
  projectId?: string
} & Pick<
  TsMorphProjectOptions,
  'compilerOptions' | 'tsConfigFilePath' | 'useInMemoryFileSystem'
>
