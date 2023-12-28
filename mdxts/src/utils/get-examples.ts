import type { Directory, SourceFile } from 'ts-morph'
import { kebabCase } from 'case-anything'

/** Gathers examples from a source file with the same base name and `.examples` extension. */
export function getExamplesFromExtension(sourceFile: SourceFile) {
  const exampleSourceFile = sourceFile
    .getDirectory()
    .getSourceFile(
      `${sourceFile.getBaseNameWithoutExtension()}.examples${sourceFile.getExtension()}`
    )

  if (!exampleSourceFile) {
    return null
  }

  return exampleSourceFile
}

/** Gathers examples from the closest `examples` directory. */
export function getExamplesFromDirectory(directory: Directory) {
  const examplesDirectory = directory.getDirectory('examples')

  if (!examplesDirectory) {
    return []
  }

  const sourceFiles = examplesDirectory.getSourceFiles()

  if (sourceFiles.length === 0) {
    return examplesDirectory.addSourceFilesAtPaths('**/*.{ts,tsx}')
  }

  return sourceFiles
}

export type ExampleItem = {
  /** The name of the example. */
  name: string

  /** The exported module. */
  moduleExport: any

  /** The slug for the example. */
  slug: string
}

/** Gathers examples from a source file. */
export async function getExamplesFromSourceFile(
  sourceFile: SourceFile,
  allModules: Record<string, Promise<Record<string, any>>>
) {
  const extensionExampleSourceFile = getExamplesFromExtension(sourceFile)
  const allExamples: ExampleItem[] = []

  if (extensionExampleSourceFile) {
    const sourceFilePath = extensionExampleSourceFile.getFilePath()

    if (sourceFilePath in allModules) {
      allExamples.push(
        ...parseExamplesFromModule(
          extensionExampleSourceFile,
          await allModules[sourceFilePath]
        )
      )
    } else {
      throw new Error(`Module not found for ${sourceFilePath}`)
    }
  }

  // TODO: Add support for examples directory.
  // const directoryExamples = getExamplesFromDirectory(sourceFile.getDirectory())

  return allExamples
}

function parseExamplesFromModule(
  sourceFile: SourceFile,
  moduleImport: Record<string, any>
) {
  const exportedDeclarations = sourceFile.getExportedDeclarations()
  const examples: ExampleItem[] = []

  Array.from(exportedDeclarations.keys()).forEach((name) => {
    const moduleExport = moduleImport[name]
    examples.push({
      name,
      moduleExport,
      slug: kebabCase(name),
    })
  })

  return examples
}
