import FilterWarningsPlugin from 'webpack-filter-warnings-plugin'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import { Project } from 'ts-morph'
import { executeCode } from '../utils/execute-code'
import { createWatcher } from '../watcher'

type PluginOptions = {
  gitSource: string
  sources: Record<
    string,
    {
      include: string | readonly string[]
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

/** Starts the MDXTS server and bundles all entry points defined in the plugin options. */
export function createMDXTSPlugin(pluginOptions: PluginOptions) {
  console.log('mdxts: config initialized')

  const project = new Project({
    tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
  })
  const loaderPaths = Object.values(pluginOptions.sources).map((options) =>
    resolve(process.cwd(), options.loader)
  )

  /** Add additional source files to project. */
  Object.values(pluginOptions.sources).map(({ include }) =>
    project.addSourceFilesAtPaths(include)
  )

  /** Run loaders for each set of source files. */
  const compile = () => {
    console.log('mdxts: compiling...')

    return Promise.all(
      Object.entries(pluginOptions.sources).map(async ([name, options]) => {
        const sourceFiles = project.addSourceFilesAtPaths(options.include)
        const loaderPath = resolve(process.cwd(), options.loader)
        const loaderContents = await readFile(loaderPath, 'utf-8')
        const loader = await executeCode(loaderContents)
        const data = await loader(sourceFiles, project)

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
        })
      )

      if (typeof getWebpackConfig === 'function') {
        return getWebpackConfig(config, options)
      }

      return config
    }

    return async (phase) => {
      await Promise.all([
        createMDXTSDirectory(),
        codemodTsConfig(),
        codemodGitIgnore(),
        compile(),
      ])

      if (phase === PHASE_DEVELOPMENT_SERVER) {
        createWatcher(project, loaderPaths, compile)
        console.log('mdxts: started watcher...')
      }

      if (nextConfig.env === undefined) {
        nextConfig.env = {}
      }

      nextConfig.env.MDXTS_GIT_SOURCE = pluginOptions.gitSource

      return nextConfig
    }
  }
}
