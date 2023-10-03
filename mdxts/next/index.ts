import FilterWarningsPlugin from 'webpack-filter-warnings-plugin'
import { NextConfig } from 'next'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFile } from 'node:fs/promises'
import CopyPlugin from 'copy-webpack-plugin'
import { Project } from 'ts-morph'
import remarkTypography from 'remark-typography'
import createMDXPlugin from '@next/mdx'
import { remarkPlugin } from '../remark'
import { rehypePlugin } from '../rehype'
import { getEditorPath } from '../utils'
import { renumberFilenames } from '../utils/renumber'
import { getTypeDeclarations } from '../utils/get-type-declarations'

type PluginOptions = {
  gitSource: string
  theme: string
  types?: string[]
}

/** Starts the MDXTS server and bundles all entry points defined in the plugin options. */
export function createMDXTSPlugin(pluginOptions: PluginOptions) {
  const { gitSource, theme, types = [] } = pluginOptions
  const themePath = resolve(process.cwd(), theme)
  const project = new Project({
    tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
  })
  const withMDX = createMDXPlugin({
    options: {
      remarkPlugins: [
        // @ts-expect-error: Typings are incorrect
        remarkTypography,
        remarkPlugin,
      ],
      rehypePlugins: [
        [
          rehypePlugin,
          {
            onJavaScriptCodeBlock: (
              filePath,
              lineStart,
              filename,
              codeString
            ) => {
              const sourceFile = project.createSourceFile(
                filename,
                codeString,
                { overwrite: true }
              )
              const diagnostics = sourceFile.getPreEmitDiagnostics()

              diagnostics.forEach((diagnostic) => {
                const message = diagnostic.getMessageText()
                const { line, column } = sourceFile.getLineAndColumnAtPos(
                  diagnostic.getStart()
                )
                const sourcePath = getEditorPath({
                  path: filePath,
                  line: lineStart + line,
                  column,
                })
                console.log(`MDXTS Error ${sourcePath}:`)
                console.log(message)
              })
            },
          },
        ],
      ],
    },
  })

  return function withMDXTS(nextConfig: NextConfig = {}) {
    const getWebpackConfig = nextConfig.webpack
    let startedWatcher = false

    return async () => {
      const typesContents = (
        await Promise.all(types.flatMap(getTypeDeclarations))
      ).flat()
      const typesFilePath = join(tmpdir(), 'types.json')

      await writeFile(typesFilePath, JSON.stringify(typesContents))

      nextConfig.webpack = (config, options) => {
        config.plugins.push(
          // TODO: #8 silencing ts-morph critical dependency warnings for now
          new FilterWarningsPlugin({
            exclude: [
              /Critical dependency: the request of a dependency is an expression/,
            ],
          })
        )

        if (options.isServer && options.dev && !startedWatcher) {
          renumberFilenames('docs')
          startedWatcher = true
        }

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

      return withMDX(nextConfig)
    }
  }
}
