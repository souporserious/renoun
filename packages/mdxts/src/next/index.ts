import webpack from 'webpack'
import { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import { resolve } from 'node:path'
import createMdxPlugin from '@next/mdx'
import type { bundledThemes } from 'shiki/bundle/web'

import { getMdxPlugins } from '../mdx-plugins'
import { createServer } from '../project/server'
import { renumberFilenames } from '../utils/renumber'
import { createRefreshServer } from './create-refresh-server'

type PluginOptions = {
  /** Path to the VS Code compatible theme used for syntax highlighting the `CodeBlock`, `CodeInline`, and `Tokens` components. */
  theme: keyof typeof bundledThemes | (string & {})

  /** The URL of the production site. This is used for generating sitemap and RSS feed URLs. If using Vercel, the `VERCEL_PROJECT_PRODUCTION_URL` [environment variable](https://vercel.com/docs/projects/environment-variables/system-environment-variables) will be used by default. */
  siteUrl?: string

  /** The git source to use for linking to the repository and source files. This is automatically inferred from the git remote URL or [Vercel environment variables](https://vercel.com/docs/projects/environment-variables/system-environment-variables) if not provided. */
  gitSource?: string

  /** The branch to use for linking to the repository and source files. */
  gitBranch?: string

  /** Whether or not to renumber ordered filenames (e.g. 01.getting-started) when adding/removing/modifying MDX files. This only occurs while the development server is running. */
  renumberFilenames?: boolean

  /** Whether or not to add rich highlighted errors in the console when type-checking source code in `CodeBlock`. Note, this may affect framework error boundaries that don't understand color encoding. */
  highlightErrors?: boolean

  /** The git provider to use. This option disables the provider detection from the `gitSource` which is helpful for self-hosted instances. */
  gitProvider?: 'github' | 'gitlab' | 'bitbucket'
}

/** A Next.js plugin to configure MDXTS theming, `rehype` and `remark` markdown plugins, and the [Webpack loader](mdxts.dev/packages/loader). */
export function createMdxtsPlugin(pluginOptions: PluginOptions) {
  let refreshServerPort: string | null = null
  let {
    gitSource = getVercelGitSource(),
    gitBranch = 'main',
    siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL,
    theme,
    renumberFilenames: renumberFilenamesOption = true,
    highlightErrors,
    gitProvider,
  } = pluginOptions
  const themePath = theme.endsWith('.json')
    ? resolve(process.cwd(), theme)
    : theme

  return function withMdxts(nextConfig: NextConfig = {}) {
    const getWebpackConfig = nextConfig.webpack
    let startedRenumberFilenameWatcher = false

    return async (phase: typeof PHASE_DEVELOPMENT_SERVER) => {
      const plugins = await getMdxPlugins({ gitSource, gitBranch, gitProvider })
      const withMdx = createMdxPlugin({
        options: plugins,
        extension: /\.(md|mdx)$/,
      })

      nextConfig.webpack = (config, options) => {
        // add default mdx components before @mdx-js/react
        config.resolve.alias['next-mdx-import-source-file'].splice(
          -1,
          0,
          resolve(__dirname, '../../src/components/MDXComponents.js')
        )

        config.plugins.push(
          // silence ts-morph and jju warnings
          new webpack.ContextReplacementPlugin(
            /\/(@ts-morph\/common|jju)\//,
            (data: { dependencies: Array<{ critical?: boolean }> }) => {
              for (const dependency of data.dependencies) {
                delete dependency.critical
              }
              return data
            }
          ),
          new webpack.IgnorePlugin({
            resourceRegExp: /^perf_hooks$/,
          })
        )

        if (
          !startedRenumberFilenameWatcher &&
          renumberFilenamesOption &&
          options.isServer &&
          options.dev
        ) {
          createServer()
          renumberFilenames()
          startedRenumberFilenameWatcher = true
        }

        config.module.rules.push({
          test: /\.(?:jsx?|tsx?)$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'mdxts/loader',
              options: { gitSource, gitBranch, gitProvider },
            },
          ],
        })

        if (typeof getWebpackConfig === 'function') {
          return getWebpackConfig(config, options)
        }

        return config
      }

      if (nextConfig.env === undefined) {
        nextConfig.env = {}
      }

      if (gitSource) {
        nextConfig.env.MDXTS_GIT_SOURCE = gitSource
      }
      nextConfig.env.MDXTS_GIT_BRANCH = gitBranch
      nextConfig.env.MDXTS_SITE_URL = siteUrl
      nextConfig.env.MDXTS_THEME_PATH = themePath
      nextConfig.env.MDXTS_HIGHLIGHT_ERRORS = String(highlightErrors)
      nextConfig.env.MDXTS_GIT_PROVIDER = gitProvider

      if (phase === PHASE_DEVELOPMENT_SERVER) {
        if (refreshServerPort === null) {
          const server = await createRefreshServer()
          const address = server.address()
          if (address === null || typeof address === 'string') {
            throw new Error('Expected server to be listening')
          }
          refreshServerPort = String(address.port)
        }
        nextConfig.env.MDXTS_REFRESH_PORT = refreshServerPort
      }

      if (nextConfig.pageExtensions === undefined) {
        nextConfig.pageExtensions = ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx']
      }

      nextConfig.experimental = {
        ...nextConfig.experimental,
        serverComponentsExternalPackages: [
          ...(nextConfig.experimental?.serverComponentsExternalPackages ?? []),
          'ts-morph',
        ],
      }

      return withMdx(nextConfig)
    }
  }
}

const VERCEL_GIT_PROVIDER = process.env.VERCEL_GIT_PROVIDER
const VERCEL_GIT_REPO_SLUG = process.env.VERCEL_GIT_REPO_SLUG
const VERCEL_GIT_REPO_OWNER = process.env.VERCEL_GIT_REPO_OWNER

/** Constructs a URL for a repository based on the provider. */
function getVercelGitSource(): string | undefined {
  switch (VERCEL_GIT_PROVIDER?.toLowerCase()) {
    case 'github':
      return `https://github.com/${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}`
    case 'gitlab':
      return `https://gitlab.com/${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}`
    case 'bitbucket':
      return `https://bitbucket.org/${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}`
  }
}
