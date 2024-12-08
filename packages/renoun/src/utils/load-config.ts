import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import type { bundledThemes, bundledLanguages } from 'shiki'

type ConfigurationOptions = {
  /** Path to the VS Code compatible theme used for syntax highlighting the `CodeBlock`, `CodeInline`, and `Tokens` components. */
  theme: keyof typeof bundledThemes | (string & {})

  /** List of languages to load for syntax highlighting. */
  languages: (keyof typeof bundledLanguages)[]

  /** Configuration options for git linking. */
  git?: {
    /** The git source to use for linking to the repository and source files. */
    source: string

    /** The branch to use for linking to the repository and source files. */
    branch: string

    /** The git provider to use. This option disables the provider detection from `git.source` which is helpful for self-hosted instances. */
    provider: 'github' | 'gitlab' | 'bitbucket'

    /** The owner of the repository. */
    owner: string

    /** The repository name. */
    repository: string

    /** The base URL of the Git provider. */
    baseUrl: string
  }

  /** The URL of the production site. This is used for generating sitemap and RSS feed URLs. */
  siteUrl?: string
}

const configPath = resolve(cwd(), 'renoun.json')
const defaultConfig = {
  theme: 'nord',
  languages: [
    'css',
    'js',
    'jsx',
    'ts',
    'tsx',
    'md',
    'mdx',
    'sh',
    'json',
    'html',
  ],
} satisfies Partial<ConfigurationOptions>

/** Loads config from `renoun.json` at the root of the project. */
export function loadConfig(): ConfigurationOptions {
  if (existsSync(configPath)) {
    const userConfig: ConfigurationOptions = JSON.parse(
      readFileSync(configPath, 'utf-8')
    )

    if (userConfig.git?.source) {
      const matches = userConfig.git.source.match(
        /^(?:(https?|ssh):\/\/|git@)?([^/:]+)[:/]([^/]+)\/([^/]+?)(\.git)?$/
      )

      if (matches) {
        const [, protocol, provider, owner, repository] = matches
        const baseUrl = protocol
          ? `${protocol}://${provider}`
          : `ssh://${provider}`

        return {
          ...defaultConfig,
          ...userConfig,
          git: {
            source: userConfig.git.source,
            provider: userConfig.git.provider || provider.split('.').at(0)!,
            branch: userConfig.git.branch ?? 'main',
            owner,
            repository,
            baseUrl,
          },
        }
      }
    }

    return {
      ...defaultConfig,
      ...userConfig,
    }
  }

  return defaultConfig
}
