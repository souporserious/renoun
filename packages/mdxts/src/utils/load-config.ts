import type { bundledThemes } from 'shiki'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path/posix'

type ConfigurationOptions = {
  /** Path to the VS Code compatible theme used for syntax highlighting the `CodeBlock`, `CodeInline`, and `Tokens` components. */
  theme: keyof typeof bundledThemes | (string & {})

  /** The URL of the production site. This is used for generating sitemap and RSS feed URLs. If using Vercel, the `VERCEL_PROJECT_PRODUCTION_URL` [environment variable](https://vercel.com/docs/projects/environment-variables/system-environment-variables) will be used by default. */
  siteUrl?: string

  /** The git source to use for linking to the repository and source files. This is automatically inferred from the git remote URL or [Vercel environment variables](https://vercel.com/docs/projects/environment-variables/system-environment-variables) if not provided. */
  gitSource?: string

  /** The branch to use for linking to the repository and source files. */
  gitBranch?: string

  /** The git provider to use. This option disables the provider detection from the `gitSource` which is helpful for self-hosted instances. */
  gitProvider?: 'github' | 'gitlab' | 'bitbucket'
}

const configPath = resolve(process.cwd(), '.mdxts/config.json')
const defaultConfig = {
  theme: 'nord',
  gitBranch: process.env.MDXTS_GIT_BRANCH || 'main',
  gitSource: process.env.MDXTS_GIT_SOURCE,
  gitProvider: process.env.MDXTS_GIT_PROVIDER as any,
} satisfies ConfigurationOptions

/** Load config from `.mdxts/config.json`. */
export function loadConfig(): ConfigurationOptions {
  const configExists = existsSync(configPath)

  if (configExists) {
    return Object.assign(
      defaultConfig,
      JSON.parse(readFileSync(configPath, 'utf-8'))
    )
  }

  return defaultConfig
}
