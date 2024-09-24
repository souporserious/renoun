import type {
  Project,
  ObjectLiteralExpression,
  ArrowFunction,
  StringLiteral,
} from 'ts-morph'
import tsMorph from 'ts-morph'

import {
  resolveObjectLiteralExpression,
  isLiteralExpressionValue,
} from '../utils/resolve-expressions.js'
import { getCollectionCallExpressions } from './get-collection-call-expressions.js'
import { getDynamicImportString } from './get-dynamic-import-string.js'
import type { CollectionOptions } from './index.js'

let project: Project

/** Inserts a dynamic import getter for each collection e.g. `(slug) => import(`${slug}.mdx`)`. */
export async function writeCollectionImports(filename?: string) {
  /* Use a default project to find all collection configurations and generate the collection import map. */
  if (!project) {
    project = new tsMorph.Project({
      tsConfigFilePath: 'tsconfig.json',
      manipulationSettings: {
        indentationText: tsMorph.IndentationText.TwoSpaces,
      },
    })
  }

  /* Refresh source file if the contents changed. */
  if (filename) {
    const sourceFile = project.getSourceFile(filename)

    if (sourceFile) {
      await sourceFile.refreshFromFileSystem()
    }
  }

  const collectionExpressions = getCollectionCallExpressions(project)

  // Update old collections API if it is being used
  collectionExpressions.forEach((callExpression) => {
    const args = callExpression.getArguments()
    const optionsArgument = args.at(0) as ObjectLiteralExpression

    if (tsMorph.Node.isStringLiteral(optionsArgument)) {
      const filePatternArgument = optionsArgument as StringLiteral
      const filePattern = filePatternArgument.getLiteralValue()

      if (args.length <= 1) {
        optionsArgument.replaceWithText(`{ filePattern: '${filePattern}' }`)
      } else {
        const optionsArgument = args.at(1) as ObjectLiteralExpression

        optionsArgument.insertPropertyAssignment(0, {
          name: 'filePattern',
          initializer: `'${filePattern}'`,
        })

        callExpression.removeArgument(filePatternArgument)
      }
    }
  })

  const collections = (
    await Promise.all(
      collectionExpressions.map(async (callExpression) => {
        const args = callExpression.getArguments()
        const optionsArgument = args.at(0) as ObjectLiteralExpression
        const optionsLiteral = resolveObjectLiteralExpression(optionsArgument)
        let options: Omit<CollectionOptions<any>, 'sort'> | undefined

        if (isLiteralExpressionValue(optionsLiteral)) {
          options = optionsLiteral as Omit<CollectionOptions<any>, 'sort'>
        } else {
          throw new Error(
            `[renoun] Expected the first argument to "createCollection" to be an object literal`
          )
        }

        const importArgument = args.at(1) as ArrowFunction | undefined
        const dynamicImportString = await getDynamicImportString(
          options.filePattern,
          options?.tsConfigFilePath
        )
        const isSameImport = importArgument
          ? normalizeImportString(importArgument.getText()) ===
            normalizeImportString(dynamicImportString)
          : false

        if (isSameImport) {
          return null
        }

        if (importArgument) {
          callExpression.removeArgument(importArgument)
        }

        callExpression.addArgument(dynamicImportString)

        // Format arguments with new lines so they are close to what the user's formatting is
        callExpression.getArguments().forEach((arg, index) => {
          const endNewLine = index === 0 ? '' : '\n'
          arg.replaceWithText('\n' + arg.getText() + endNewLine)
          arg.formatText()
        })

        callExpression.formatText()
      })
    )
  ).filter((collection) => collection !== null)

  if (collections.length === 0) {
    return
  }

  return project.save()
}

/** Normalizes an import string by formatting it consistently. */
function normalizeImportString(str: string): string {
  return (
    str
      // Remove parentheses around single parameters in arrow functions
      .replace(/\(\s*([a-zA-Z_$][0-9a-zA-Z_$]*)\s*\)\s*=>/g, '$1 =>')
      // Remove line breaks, extra spaces, and commas
      .replace(/[\s,]+/g, '')
  )
}
