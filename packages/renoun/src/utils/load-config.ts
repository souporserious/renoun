import type { bundledThemes } from 'shiki'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path/posix'

type ConfigurationOptions = {
  /** Path to the VS Code compatible theme used for syntax highlighting the `CodeBlock`, `CodeInline`, and `Tokens` components. */
  theme: keyof typeof bundledThemes | (string & {})

  /** Configuration options for git linking. */
  git?: {
    /** The git source to use for linking to the repository and source files. This is automatically inferred from the git remote URL or [Vercel environment variables](https://vercel.com/docs/projects/environment-variables/system-environment-variables) if not provided. */
    source?: string

    /** The branch to use for linking to the repository and source files. */
    branch?: string

    /** The git provider to use. This option disables the provider detection from the `gitSource` which is helpful for self-hosted instances. */
    provider?: 'github' | 'gitlab' | 'bitbucket'
  }

  /** The URL of the production site. This is used for generating sitemap and RSS feed URLs. If using Vercel, the `VERCEL_PROJECT_PRODUCTION_URL` [environment variable](https://vercel.com/docs/projects/environment-variables/system-environment-variables) will be used by default. */
  siteUrl?: string
}

const configPath = resolve(process.cwd(), 'renoun.json')
const defaultConfig = {
  theme: 'nord',
  git: {
    branch: process.env.RENOUN_GIT_BRANCH || 'main',
    provider: process.env.RENOUN_GIT_PROVIDER as any,
    source: process.env.RENOUN_GIT_SOURCE,
  },
} satisfies ConfigurationOptions

/** Load config from `.renoun/config.json`. */
export function loadConfig(): ConfigurationOptions {
  if (existsSync(configPath)) {
    const userConfig: ConfigurationOptions = JSON.parse(
      readFileSync(configPath, 'utf-8')
    )

    return {
      ...defaultConfig,
      ...userConfig,
      git: {
        ...defaultConfig.git,
        ...userConfig.git,
      },
    }
  }

  return defaultConfig
}
