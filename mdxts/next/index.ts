import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { NextConfig } from 'next'
import { Project } from 'ts-morph'
import { executeCode } from '../execute-code'

type PluginOptions = Record<
  string,
  {
    include: string | readonly string[]
    loader: string
  }
>

/** Codemod TS config file to add a path alias for "mdxts/data". */
async function codemodTsConfig() {
  const tsConfigFilePath = resolve(process.cwd(), 'tsconfig.json')
  const tsConfig = JSON.parse(await readFile(tsConfigFilePath, 'utf8'))

  if (tsConfig.compilerOptions.paths?.['mdxts/data']) {
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

  console.log('Added path alias for mdxts/data to tsconfig.json')
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

  console.log('Added .mdxts directory to .gitignore')
}

/** Starts the MDXTS server and bundles all entry points defined in the plugin options. */
export function createMDXTSPlugin(pluginOptions: PluginOptions = {}) {
  return async function withMDXTS(nextConfig: NextConfig = {}) {
    await new Promise(async (resolvePromise, reject) => {
      const project = new Project({
        tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
      })

      /** Add additional source files to project. */
      const addedSourceFiles = Object.values(pluginOptions).map(({ include }) =>
        project.addSourceFilesAtPaths(include)
      )

      /** Run loaders for each set of source files. */
      await Promise.all(
        Object.entries(pluginOptions).map(async ([name, options], index) => {
          const sourceFiles = addedSourceFiles[index]
          const loaderPath = resolve(process.cwd(), options.loader)
          const loaderContents = await readFile(loaderPath, 'utf8')
          const loader = await executeCode(loaderContents)
          const data = await loader(sourceFiles)

          await writeFile(
            resolve(process.cwd(), '.mdxts', `${name}.json`),
            JSON.stringify(data, null, 2)
          )
        })
      )

      Promise.all([codemodTsConfig(), codemodGitIgnore()])
        .then(resolvePromise)
        .catch(reject)
    })

    return nextConfig
  }
}
