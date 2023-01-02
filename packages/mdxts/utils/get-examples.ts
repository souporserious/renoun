import type { Directory } from 'ts-morph'
import { kebabCase } from 'case-anything'

import { transformCode } from './transform-code'

/** Returns example data for a directory. */
export async function getExamples(directory: Directory) {
  const examples = directory.addSourceFilesAtPaths('examples/*.tsx')

  return Promise.all(
    examples.map(async (example) => {
      const exampleName = example.getBaseNameWithoutExtension()
      const exampleCodeString = example.getFullText()
      const transformedCodeString = await transformCode(exampleCodeString)

      return {
        name: exampleName,
        sourceCode: exampleCodeString,
        compiledCode: transformedCodeString,
        slug: kebabCase(exampleName),
        path:
          process.env.NODE_ENV === 'development' ? example.getFilePath() : null,
      }
    })
  )
}
