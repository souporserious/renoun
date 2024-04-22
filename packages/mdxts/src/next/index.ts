import webpack from 'webpack'
import { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import { dirname, resolve, join } from 'node:path'
import createMdxPlugin from '@next/mdx'
// import { BUNDLED_THEMES } from 'shiki'

import { getMdxPlugins } from '../mdx-plugins'
import { renumberFilenames } from '../utils/renumber'
import { createRefreshServer } from './create-refresh-server'

type PluginOptions = {
  /** Path to the VS Code compatible theme used for syntax highlighting the Code and Editor components. */
  theme: any
  // theme: (typeof BUNDLED_THEMES)[number] | (string & {})

  /** The URL of the production site. This is used for generating sitemap and RSS feed URLs. */
  siteUrl?: string

  /** The git source to use for linking to the repository and source files. This is automatically inferred from the git remote URL if not provided. */
  gitSource?: string

  /** The branch to use for linking to the repository and source files. */
  gitBranch?: string
}

/** A Next.js plugin to configure MDXTS theming, `rehype` and `remark` markdown plugins, and the [Webpack loader](mdxts.dev/packages/loader). */
export function createMdxtsPlugin(pluginOptions: PluginOptions) {
  let refreshServerPort: string | null = null
  let { gitSource, gitBranch = 'main', siteUrl, theme } = pluginOptions
  let themePath = resolve(process.cwd(), theme)

  return function withMdxts(nextConfig: NextConfig = {}) {
    const getWebpackConfig = nextConfig.webpack
    let startedWatcher = false

    return async (phase: typeof PHASE_DEVELOPMENT_SERVER) => {
      const plugins = await getMdxPlugins({ gitSource })
      const withMdx = createMdxPlugin({ options: plugins })

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

        if (options.isServer && options.dev && !startedWatcher) {
          renumberFilenames()
          startedWatcher = true
        }

        config.module.rules.push({
          test: /\.(?:jsx?|tsx?)$/,
          exclude: /node_modules/,
          use: [{ loader: 'mdxts/loader' }],
        })

        if (typeof getWebpackConfig === 'function') {
          return getWebpackConfig(config, options)
        }

        return config
      }

      if (nextConfig.env === undefined) {
        nextConfig.env = {}
      }

      nextConfig.env.MDXTS_GIT_SOURCE = gitSource ?? ''
      nextConfig.env.MDXTS_GIT_BRANCH = gitBranch
      nextConfig.env.MDXTS_SITE_URL = siteUrl

      // if (!theme.endsWith('.json')) {
      //   const { readPackageUp } = await import('read-package-up')
      //   const shikiPackageJson = await readPackageUp({
      //     cwd: dirname(require.resolve('shiki')),
      //   })
      //   themePath = join(
      //     dirname(shikiPackageJson!.path),
      //     'themes',
      //     `${theme}.json`
      //   )
      // }

      nextConfig.env.MDXTS_THEME_PATH = themePath

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
        turbo: {
          rules: {
            '*.ts': {
              as: '*.ts',
              loaders: [{ loader: 'mdxts/loader', options: {} }],
            },
            '*.tsx': {
              as: '*.tsx',
              loaders: [{ loader: 'mdxts/loader', options: {} }],
            },
          },
        },
        serverComponentsExternalPackages: [
          ...(nextConfig.experimental?.serverComponentsExternalPackages ?? []),
          'ts-morph',
        ],
      }

      return withMdx(nextConfig)
    }
  }
}
