import webpack from 'webpack'
import { NextConfig } from 'next'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import CopyPlugin from 'copy-webpack-plugin'
import remarkTypography from 'remark-typography'
import createMdxPlugin from '@next/mdx'

import { remarkPlugin } from '../remark'
import { rehypePlugin } from '../rehype'
import { renumberFilenames } from '../utils/renumber'
import { getTypeDeclarations } from '../utils/get-type-declarations'
import { addGitSourceToMdxtsConfig } from './add-git-source'

type PluginOptions = {
  /** Path to the VS Code compatible theme used for syntax highlighting the Code and Editor components. */
  theme: string

  /** The git source to use for linking to the repository and source files. This is automatically inferred from the git remote URL if not provided. */
  gitSource?: string

  /** The branch to use for linking to the repository and source files. */
  gitBranch?: string

  /** The type declarations to bundle for the Code and Editor components. */
  types?: string[]
}

/** Starts the MDXTS server and bundles all entry points defined in the plugin options. */
export function createMdxtsPlugin(pluginOptions: PluginOptions) {
  let { gitSource, gitBranch = 'main', theme, types = [] } = pluginOptions
  const themePath = resolve(process.cwd(), theme)

  /** Attempt to resolve the git source from the git remote URL and add it to the next config file. */
  if (gitSource === undefined) {
    try {
      const stdout = execSync('git remote get-url origin')
      gitSource = stdout
        .toString()
        .trim()
        .replace(/\.git$/, '')
      addGitSourceToMdxtsConfig(gitSource)
    } catch (error) {
      throw new Error(
        'Could not infer git source from git remote URL. Please provide a git source in the mdxts/next plugin options.',
        { cause: error }
      )
    }
  }

  return function withMdxts(nextConfig: NextConfig = {}) {
    const getWebpackConfig = nextConfig.webpack
    let startedWatcher = false

    return async () => {
      const [
        remarkGemoji,
        remarkGfm,
        remarkGitHub,
        remarkStripBadges,
        remarkSqueezeParagraphs,
        remarkUnwrapImages,
      ] = await Promise.all([
        import('remark-gemoji'),
        import('remark-gfm'),
        import('remark-github'),
        import('remark-strip-badges'),
        import('remark-squeeze-paragraphs'),
        import('remark-unwrap-images'),
      ])
      const withMdx = createMdxPlugin({
        options: {
          remarkPlugins: [
            remarkGemoji,
            remarkGfm,
            remarkGitHub,
            remarkStripBadges,
            remarkSqueezeParagraphs,
            remarkUnwrapImages,
            remarkTypography,
            remarkPlugin,
          ] as any,
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
          use: [{ loader: 'mdxts/loader', options: { themePath } }],
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

      nextConfig.env.MDXTS_GIT_SOURCE = gitSource.replace(/\.git$/, '')
      nextConfig.env.MDXTS_GIT_BRANCH = gitBranch

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
