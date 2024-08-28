import webpack from 'webpack'
import { resolve } from 'node:path'
import { NextConfig } from 'next'
import createMdxPlugin from '@next/mdx'
import type { bundledThemes } from 'shiki/bundle/web'

import { generateCollectionImportMap } from '../collections/import-maps'
import { getMdxPlugins } from '../mdx-plugins'
import { createServer } from '../project/server'

type PluginOptions = {
  /** Path to the VS Code compatible theme used for syntax highlighting the `CodeBlock`, `CodeInline`, and `Tokens` components. */
  theme?: keyof typeof bundledThemes | (string & {})

  /** The URL of the production site. This is used for generating sitemap and RSS feed URLs. If using Vercel, the `VERCEL_PROJECT_PRODUCTION_URL` [environment variable](https://vercel.com/docs/projects/environment-variables/system-environment-variables) will be used by default. */
  siteUrl?: string

  /** The branch to use for linking to the repository and source files. */
  gitBranch?: string

  /** The git provider to use. This option disables the provider detection from the `gitSource` which is helpful for self-hosted instances. */
  gitProvider?: 'github' | 'gitlab' | 'bitbucket'

  /** The git source to use for linking to the repository and source files. This is automatically inferred from the git remote URL or [Vercel environment variables](https://vercel.com/docs/projects/environment-variables/system-environment-variables) if not provided. */
  gitSource?: string
}

/** Immediately generate the initial collection import map. */
const importMapPromise = generateCollectionImportMap()

/** A Next.js plugin to configure MDXTS theming, `rehype` and `remark` markdown plugins. */
export function createMdxtsPlugin(pluginOptions: PluginOptions) {
  let {
    theme = 'nord',
    gitBranch = 'main',
    gitProvider,
    gitSource,
    siteUrl,
  } = pluginOptions
  const themePath = theme?.endsWith('.json')
    ? resolve(process.cwd(), theme)
    : theme

  process.env.MDXTS_THEME_PATH = themePath

  return function withMdxts(nextConfig: NextConfig = {}) {
    const getWebpackConfig = nextConfig.webpack
    let startedServer = process.env.MDXTS_SERVER === 'true'

    return async () => {
      await importMapPromise

      const plugins = await getMdxPlugins({ gitSource, gitBranch, gitProvider })
      const withMdx = createMdxPlugin({
        options: plugins,
        extension: /\.(md|mdx)$/,
      })

      nextConfig.webpack = (config, options) => {
        if (!startedServer && options.isServer && options.dev) {
          createServer()
          startedServer = true
        }

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
      nextConfig.env.MDXTS_GIT_PROVIDER = gitProvider
      nextConfig.env.MDXTS_SITE_URL = siteUrl
      nextConfig.env.MDXTS_THEME_PATH = themePath

      if (nextConfig.pageExtensions === undefined) {
        nextConfig.pageExtensions = ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx']
      }

      return withMdx(nextConfig)
    }
  }
}
