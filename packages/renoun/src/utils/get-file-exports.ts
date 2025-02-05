import type { Node, Project } from 'ts-morph'
import * as tsMorph from 'ts-morph'

import { getDeclarationLocation } from './get-declaration-location.js'
import { getJsDocMetadata } from './get-js-doc-metadata.js'

export interface FileExport {
  name: string
  path: string
  position: number
  kind: tsMorph.SyntaxKind
}

/** Returns metadata about the exports of a file. */
export function getFileExports(
  filePath: string,
  project: Project
): {
  name: string
  path: string
  position: number
  kind: tsMorph.SyntaxKind
}[] {
  let sourceFile = project.getSourceFile(filePath)

  if (!sourceFile) {
    sourceFile = project.addSourceFileAtPath(filePath)
  }

  const exportDeclarations = []

  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    for (const declaration of declarations) {
      const isExportable = tsMorph.Node.isExportable(
        tsMorph.Node.isVariableDeclaration(declaration)
          ? declaration.getParentOrThrow().getParent()
          : declaration
      )

      if (isExportable) {
        if (tsMorph.Node.isFunctionDeclaration(declaration)) {
          const body = declaration.getBody()

          if (body === undefined) {
            continue
          }
        }

        exportDeclarations.push({
          name,
          path: declaration.getSourceFile().getFilePath(),
          position: declaration.getPos(),
          kind: declaration.getKind(),
        })
      }
    }
  }

  return exportDeclarations
}

/** Returns a specific export declaration of a file at a given position and kind. */
export function getFileExportDeclaration(
  filePath: string,
  position: number,
  kind: tsMorph.SyntaxKind,
  project: Project
) {
  const sourceFile = project.getSourceFile(filePath)
  if (!sourceFile) {
    throw new Error(`[renoun] Source file not found: ${filePath}`)
  }

  const declaration = sourceFile.getDescendantAtPos(position)
  if (!declaration) {
    throw new Error(`[renoun] Declaration not found at position ${position}`)
  }

  const exportDeclaration = declaration.getFirstAncestorByKind(kind)
  if (!exportDeclaration) {
    throw new Error(
      `[renoun] Could not resolve type for file path "${filePath}" at position "${position}". No ancestor of kind "${tsMorph.SyntaxKind[kind]}" was found starting from: "${declaration.getText()}".`
    )
  }

  return exportDeclaration
}

/** Returns metadata about a specific export of a file. */
export async function getFileExportMetadata(
  name: string,
  filePath: string,
  position: number,
  kind: tsMorph.SyntaxKind,
  project: Project
) {
  const sourceFile = project.getSourceFile(filePath)

  if (!sourceFile) {
    throw new Error(`[renoun] Source file not found: ${filePath}`)
  }

  const exportDeclaration = getFileExportDeclaration(
    filePath,
    position,
    kind,
    project
  )

  return {
    name: getName(
      sourceFile.getBaseNameWithoutExtension(),
      name,
      exportDeclaration
    ),
    environment: getEnvironment(exportDeclaration),
    jsDocMetadata: getJsDocMetadata(exportDeclaration),
    location: getDeclarationLocation(exportDeclaration),
  }
}

/** Get the name of an export declaration, accounting for default exports. */
function getName(
  fileName: string,
  exportName: string,
  exportDeclaration: Node
) {
  if (exportName === 'default') {
    const name = exportDeclaration
      ? getDeclarationName(exportDeclaration)
      : undefined

    // Use the file name as the default export name if it is not defined
    if (name === undefined) {
      return fileName
    }

    return name
  }

  return exportName
}

/** Get the name of a declaration. */
function getDeclarationName(declaration: Node) {
  if (tsMorph.Node.isVariableDeclaration(declaration)) {
    return declaration.getNameNode().getText()
  } else if (tsMorph.Node.isFunctionDeclaration(declaration)) {
    return declaration.getName()
  } else if (tsMorph.Node.isClassDeclaration(declaration)) {
    return declaration.getName()
  }
}

/** Get the rendering environment of a declaration. */
function getEnvironment(declaration: Node) {
  const importDeclarations = declaration.getSourceFile().getImportDeclarations()

  for (const importDeclaration of importDeclarations) {
    const specifier = importDeclaration.getModuleSpecifierValue()
    if (specifier === 'server-only') {
      return 'server'
    }
    if (specifier === 'client-only') {
      return 'client'
    }
  }

  return 'isomorphic'
}
