import FilterWarningsPlugin from 'webpack-filter-warnings-plugin'
import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin'
import { resolve } from 'node:path'
import { NextConfig } from 'next'
import CopyPlugin from 'copy-webpack-plugin'
import { Project } from 'ts-morph'
import remarkTypography from 'remark-typography'
import createMDXPlugin from '@next/mdx'
import { remarkPlugin } from '../remark'
import { rehypePlugin } from '../rehype'
import { getEditorPath } from '../utils'
import { renumberFilenames } from '../utils/renumber'

type PluginOptions = {
  gitSource: string
  theme: string
}

/** Starts the MDXTS server and bundles all entry points defined in the plugin options. */
export function createMDXTSPlugin(pluginOptions: PluginOptions) {
  const { gitSource, theme } = pluginOptions
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

    nextConfig.webpack = (config, options) => {
      config.plugins.push(
        // TODO: #8 silencing ts-morph critical dependency warnings for now
        new FilterWarningsPlugin({
          exclude: [
            /Critical dependency: the request of a dependency is an expression/,
          ],
        }),
        new MonacoWebpackPlugin({
          filename: 'static/[name].worker.js',
          languages: ['css', 'javascript', 'typescript'],
        })
      )

      // Disable normal WASM loading pipeline so onigasm can load properly
      config.module.rules.push({
        test: /onig\.wasm$/,
        type: 'asset/resource',
        generator: {
          filename: 'static/wasm/onigasm.wasm',
        },
      })

      // Load theme for Code component
      config.plugins.push(
        new CopyPlugin({
          patterns: [
            {
              from: themePath,
              to: 'static/mdxts/theme.json',
            },
          ],
        })
      )

      if (options.isServer && options.dev && !startedWatcher) {
        renumberFilenames('docs')
        startedWatcher = true
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
