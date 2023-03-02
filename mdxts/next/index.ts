import FilterWarningsPlugin from 'webpack-filter-warnings-plugin'
import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import { Project } from 'ts-morph'
import { executeCode } from '../transform/execute-code'
import { getSourceFilesData } from '../utils/get-source-files-data'
import { createWatcher } from '../watcher'
import { createPublicFiles } from './create-public-files'

type FileGlobs = string | readonly string[]

type PluginOptions = {
  gitSource: string
  theme: string
  sources: Record<
    string,
    | FileGlobs
    | {
        include: FileGlobs
        loader: string
      }
  >
}

type NormalizedPluginOptions = {
  gitSource: string
  theme: string
  sources: Record<
    string,
    {
      include: FileGlobs
      loader: string
    }
  >
}

async function createMDXTSDirectory() {
  const directoryPath = resolve(process.cwd(), '.mdxts')

  try {
    await access(directoryPath)
  } catch {
    await mkdir(directoryPath)
  }
}

/** Codemod TS config file to add a path alias for "mdxts/data". */
async function codemodTsConfig() {
  const tsConfigFilePath = resolve(process.cwd(), 'tsconfig.json')
  const tsConfig = JSON.parse(await readFile(tsConfigFilePath, 'utf8'))

  if (tsConfig.compilerOptions.paths?.['mdxts/*']) {
    return
  }

  if (!tsConfig.compilerOptions.baseUrl) {
    tsConfig.compilerOptions.baseUrl = '.'
  }

  tsConfig.compilerOptions.paths = {
    ...(tsConfig.compilerOptions.paths || {}),
    'mdxts/*': ['./.mdxts/*.json'],
  }

  await writeFile(tsConfigFilePath, JSON.stringify(tsConfig, null, 2))

  console.log('mdxts: added path alias for mdxts/data to tsconfig.json')
}

/** Codemod the git ignore file to ignore the mdxts data directory. */
async function codemodGitIgnore() {
  const { findUp } = await import('find-up')
  const gitIgnoreFilePath = await findUp('.gitignore')

  if (gitIgnoreFilePath === undefined) {
    return
  }

  const gitIgnore = await readFile(gitIgnoreFilePath, 'utf8')

  if (gitIgnore.includes('.mdxts')) {
    return
  }

  await writeFile(gitIgnoreFilePath, gitIgnore + '\n.mdxts')

  console.log('mdxts: added .mdxts directory to .gitignore')
}

function normalizeOptions(pluginOptions: PluginOptions) {
  Object.entries(pluginOptions.sources).forEach(([name, options]) => {
    if (typeof options === 'string') {
      pluginOptions.sources[name] = {
        include: options,
        loader: null,
      }
    }
  })

  return pluginOptions as NormalizedPluginOptions
}

/** Starts the MDXTS server and bundles all entry points defined in the plugin options. */
export function createMDXTSPlugin(pluginOptions: PluginOptions) {
  console.log('mdxts: config initialized')

  const { gitSource, theme, sources } = normalizeOptions(pluginOptions)
  const project = new Project({
    tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
  })
  const loaderPaths = Object.values(sources)
    .map((options) =>
      options.loader ? resolve(process.cwd(), options.loader) : null
    )
    .filter(Boolean)

  /** Run loaders for each set of source files. */
  const compile = () => {
    console.log('mdxts: compiling...')

    return Promise.all(
      Object.entries(sources).map(async ([name, options]) => {
        const sourceFiles = project.addSourceFilesAtPaths(options.include)
        const sourceFilesData = getSourceFilesData(sourceFiles)
        let loader: any = (sourceFilesData) => sourceFilesData

        if (options.loader) {
          try {
            const loaderPath = resolve(process.cwd(), options.loader)
            const loaderContents = await readFile(loaderPath, 'utf-8')
            loader = await executeCode(loaderContents)
          } catch (error) {
            console.error(`mdxts: error loading loader for ${name}`, error)
          }
        }

        const data = await loader(sourceFilesData, sourceFiles, project)

        await writeFile(
          resolve(process.cwd(), '.mdxts', `${name}.json`),
          JSON.stringify(data, null, 2)
        )
      })
    )
  }

  return function withMDXTS(nextConfig: NextConfig = {}) {
    const getWebpackConfig = nextConfig.webpack

    // TODO: #8 silencing ts-morph critical dependency warnings for now
    nextConfig.webpack = (config, options) => {
      config.plugins.push(
        new FilterWarningsPlugin({
          exclude: [
            /Critical dependency: the request of a dependency is an expression/,
          ],
        }),
        new MonacoWebpackPlugin({
          languages: ['javascript', 'typescript'],
          filename: 'static/[name].worker.js',
        })
      )

      if (typeof getWebpackConfig === 'function') {
        return getWebpackConfig(config, options)
      }

      return config
    }

    let watcherCreated = false

    return async (phase) => {
      await Promise.all([
        createMDXTSDirectory(),
        createPublicFiles(),
        codemodTsConfig(),
        codemodGitIgnore(),
        compile(),
      ])

      if (!watcherCreated && phase === PHASE_DEVELOPMENT_SERVER) {
        watcherCreated = true
        createWatcher(project, loaderPaths, compile)
        console.log('mdxts: started watcher...')
      }

      if (nextConfig.env === undefined) {
        nextConfig.env = {}
      }

      nextConfig.env.MDXTS_GIT_SOURCE = gitSource
      nextConfig.env.MDXTS_THEME = await readFile(
        resolve(process.cwd(), theme),
        'utf-8'
      )

      return nextConfig
    }
  }
}
