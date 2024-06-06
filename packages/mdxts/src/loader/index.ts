import * as webpack from 'webpack'
import { dirname } from 'node:path'

import { addCodeMetaProps } from './add-code-meta-props'
import { augmentCreateSource } from './augment-create-source'

/**
 * A Webpack loader that exports front matter data for MDX files and augments `createSource` call sites to add an additional
 * argument of all dynamic imports based on the provided file pattern.
 */
export default async function loader(
  this: webpack.LoaderContext<{
    gitSource?: string
    gitBranch?: string
    gitProvider?: string
  }>,
  source: string | Buffer
) {
  const { gitSource, gitBranch, gitProvider } = this.getOptions()
  const callback = this.async()
  const sourceString = source.toString()
  const workingDirectory = dirname(this.resourcePath)

  /** Augment CodeBlock and ExportedTypes components to add the working directory and source path. */
  const isMDXTSComponentImported =
    /import\s+{\s*([^}]*\b(CodeBlock|ExportedTypes)\b[^}]*)\s*}/g.test(
      sourceString
    )

  if (isMDXTSComponentImported) {
    source = addCodeMetaProps(
      sourceString,
      this.resourcePath,
      workingDirectory,
      gitSource,
      gitBranch,
      gitProvider
    )
  }

  /** Augment `createSource` calls with MDX/TypeScript file paths. */
  const isCreateSourceImported =
    /.*import\s\{[^}]*createSource[^}]*\}\sfrom\s['"]mdxts['"].*/.test(
      sourceString
    )

  /** Only cache the loader if `createSource` is not imported. */
  this.cacheable(!isCreateSourceImported)

  if (isCreateSourceImported) {
    try {
      const { filePaths, sourceText } = await augmentCreateSource(
        sourceString,
        workingDirectory
      )

      filePaths.forEach((filePath) => {
        this.addDependency(filePath)
      })

      callback(null, sourceText)
    } catch (error) {
      if (error instanceof Error) {
        callback(error)
      } else {
        throw error
      }
    }
  } else {
    callback(null, source)
  }
}
