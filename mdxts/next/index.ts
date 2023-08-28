import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import { Project } from 'ts-morph'
import createMDXPlugin from '@next/mdx'
import { remarkPlugin } from '../remark'
import { rehypePlugin } from '../rehype'

type PluginOptions = {
  gitSource: string
  theme: string
}

/** Starts the MDXTS server and bundles all entry points defined in the plugin options. */
export function createMDXTSPlugin(pluginOptions: PluginOptions) {
  console.log('mdxts: config initialized')

  const { gitSource, theme } = pluginOptions

  return function withMDXTS(nextConfig: NextConfig = {}) {
    const getWebpackConfig = nextConfig.webpack

    nextConfig.webpack = (config, options) => {
      config.plugins.push(
        new MonacoWebpackPlugin({
          filename: 'static/[name].worker.js',
          languages: options.isServer ? [] : ['javascript', 'typescript'],
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

      if (typeof getWebpackConfig === 'function') {
        return getWebpackConfig(config, options)
      }

      return config
    }

    let watcherCreated = false
    let withMDX: ReturnType<typeof createMDXPlugin>

    return async (phase) => {
      const themePath = resolve(process.cwd(), theme)

      if (withMDX === undefined) {
        // const project = new Project({
        //   tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
        // })

        withMDX = createMDXPlugin({
          options: {
            remarkPlugins: [remarkPlugin],
            rehypePlugins: [rehypePlugin],
          },
        })
      }

      //   if (!watcherCreated && phase === PHASE_DEVELOPMENT_SERVER) {
      //     // watcherCreated = true
      //     // createWatcher(project, loaderPaths, compile)
      //     // console.log('mdxts: started watcher...')
      //   }

      if (nextConfig.env === undefined) {
        nextConfig.env = {}
      }

      nextConfig.env.MDXTS_GIT_SOURCE = gitSource
      nextConfig.env.MDXTS_THEME_PATH = themePath
      nextConfig.env.MDXTS_THEME = (await readFile(themePath, 'utf-8'))
        // replace single line comments with empty string
        .replace(/\/\/.*/g, '')

      if (nextConfig.pageExtensions === undefined) {
        nextConfig.pageExtensions = ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx']
      }

      // @ts-expect-error
      return withMDX(nextConfig)
    }
  }
}
