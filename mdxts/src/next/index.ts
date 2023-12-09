import webpack from 'webpack'
import { NextConfig } from 'next'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFile } from 'node:fs/promises'
import CopyPlugin from 'copy-webpack-plugin'
import remarkTypography from 'remark-typography'
import createMdxPlugin from '@next/mdx'
import { remarkPlugin } from '../remark'
import { rehypePlugin } from '../rehype'
import { renumberFilenames } from '../utils/renumber'
import { getTypeDeclarations } from '../utils/get-type-declarations'

type PluginOptions = {
  /** The git source to use for linking to the repository and source files. */
  gitSource: string

  /** Path to the VS Code compatible theme used for syntax highlighting the Code and Editor components. */
  theme: string

  /** The type declarations to bundle for the Code and Editor components. */
  types?: string[]
}

/** Starts the MDXTS server and bundles all entry points defined in the plugin options. */
export function createMdxtsPlugin(pluginOptions: PluginOptions) {
  const { gitSource, theme, types = [] } = pluginOptions
  const themePath = resolve(process.cwd(), theme)

  return function withMdxts(nextConfig: NextConfig = {}) {
    const getWebpackConfig = nextConfig.webpack
    let startedWatcher = false

    return async () => {
      const [remarkGfm, remarkUnwrapImages] = await Promise.all([
        import('remark-gfm'),
        import('remark-unwrap-images'),
      ])
      const withMdx = createMdxPlugin({
        options: {
          remarkPlugins: [
            // @ts-expect-error: Typings are incorrect
            remarkGfm,
            // @ts-expect-error: Typings are incorrect
            remarkUnwrapImages,
            // @ts-expect-error: Typings are incorrect
            remarkTypography,
            // @ts-expect-error: Typings are incorrect
            remarkPlugin,
          ],
          rehypePlugins: [rehypePlugin],
        },
      })
      const typesContents = (
        await Promise.all(types.flatMap(getTypeDeclarations))
      ).flat()
      const typesFilePath = join(tmpdir(), 'types.json')

      await writeFile(typesFilePath, JSON.stringify(typesContents))

      nextConfig.webpack = (config, options) => {
        config.plugins.push(
          // silence ts-morph warnings
          new webpack.ContextReplacementPlugin(
            /\/@ts-morph\/common\//,
            (data) => {
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
          test: /\.(?:jsx?|tsx?|mdx?)$/,
          exclude: /node_modules/,
          use: ['mdxts/loader'],
        })

        config.module.rules.push({
          test: /onig\.wasm$/,
          type: 'asset/resource',
        })

        if (options.isServer === false) {
          config.plugins.push(
            new CopyPlugin({
              patterns: [
                {
                  from: require.resolve(
                    'shiki/languages/javascript.tmLanguage.json'
                  ),
                  to: 'static/mdxts',
                },
                {
                  from: require.resolve(
                    'shiki/languages/typescript.tmLanguage.json'
                  ),
                  to: 'static/mdxts',
                },
                {
                  from: require.resolve('shiki/languages/jsx.tmLanguage.json'),
                  to: 'static/mdxts',
                },
                {
                  from: require.resolve('shiki/languages/tsx.tmLanguage.json'),
                  to: 'static/mdxts',
                },
                {
                  from: require.resolve('shiki/languages/css.tmLanguage.json'),
                  to: 'static/mdxts',
                },
                {
                  from: require.resolve('shiki/languages/json.tmLanguage.json'),
                  to: 'static/mdxts',
                },
                {
                  from: require.resolve(
                    'shiki/languages/shellscript.tmLanguage.json'
                  ),
                  to: 'static/mdxts',
                },
                {
                  from: require.resolve('vscode-oniguruma/release/onig.wasm'),
                  to: 'static/mdxts',
                },
                {
                  from: typesFilePath,
                  to: 'static/mdxts',
                },
              ],
            })
          )
        }

        if (typeof getWebpackConfig === 'function') {
          return getWebpackConfig(config, options)
        }

        return config
      }

      if (nextConfig.env === undefined) {
        nextConfig.env = {}
      }

      nextConfig.env.MDXTS_GIT_SOURCE = gitSource

      if (nextConfig.pageExtensions === undefined) {
        nextConfig.pageExtensions = ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx']
      }

      const packages = ['mdxts', 'mdxts/components', 'mdxts/components/client']

      nextConfig.transpilePackages = nextConfig.transpilePackages
        ? nextConfig.transpilePackages.concat(packages)
        : packages

      nextConfig.experimental = {
        ...nextConfig.experimental,
        serverComponentsExternalPackages: [
          ...(nextConfig.experimental?.serverComponentsExternalPackages ?? []),
          'esbuild',
          'shiki',
          'vscode-oniguruma',
          'ts-morph',
          'typescript',
        ],
      }

      return withMdx(nextConfig)
    }
  }
}
