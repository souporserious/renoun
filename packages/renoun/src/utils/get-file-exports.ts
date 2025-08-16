import type { Node, Project } from 'ts-morph'
import * as tsMorph from 'ts-morph'

import { debug } from './debug.js'
import { getDeclarationLocation } from './get-declaration-location.js'
import { getJsDocMetadata } from './get-js-doc-metadata.js'

export interface FileExport {
  name: string
  path: string
  position: number
  kind: tsMorph.SyntaxKind
}

const exportableKinds = new Set([
  tsMorph.SyntaxKind.ExportAssignment,
  tsMorph.SyntaxKind.ExportDeclaration,
  tsMorph.SyntaxKind.ExportSpecifier,
  tsMorph.SyntaxKind.ClassDeclaration,
  tsMorph.SyntaxKind.EnumDeclaration,
  tsMorph.SyntaxKind.FunctionDeclaration,
  tsMorph.SyntaxKind.VariableDeclaration,
  tsMorph.SyntaxKind.VariableStatement,
  tsMorph.SyntaxKind.InterfaceDeclaration,
  tsMorph.SyntaxKind.TypeAliasDeclaration,
])

/** Returns metadata about the exports of a file. */
export function getFileExports(
  filePath: string,
  project: Project
): FileExport[] {
  return debug.trackOperation(
    'get-file-exports',
    () => {
      let sourceFile = project.getSourceFile(filePath)

      if (!sourceFile) {
        const addStart = performance.now()
        sourceFile = project.addSourceFileAtPath(filePath)

        debug.debug('Added source file to project', {
          operation: 'get-file-exports',
          data: {
            filePath,
            wasAdded: true,
            duration: (performance.now() - addStart).toFixed(1),
            projectFiles: project.getSourceFiles().length,
          },
        })
      }

      const processStart = performance.now()
      const exportDeclarations: FileExport[] = []
      const exportedDeclarations = sourceFile.getExportedDeclarations()
      const totalDeclarations = exportedDeclarations.size

      debug.debug('Processing exported declarations', {
        operation: 'get-file-exports',
        data: {
          filePath,
          totalDeclarations,
          hasSourceFile: Boolean(sourceFile),
          duration: (performance.now() - processStart).toFixed(1),
        },
      })

      for (const [name, declarations] of exportedDeclarations) {
        for (const declaration of declarations) {
          if (!exportableKinds.has(declaration.getKind())) {
            continue
          }

          if (tsMorph.Node.isFunctionDeclaration(declaration)) {
            const body = declaration.getBody()

            if (body === undefined) {
              continue
            }
          }

          let node: Node = declaration

          // export { foo } = bar
          const exportAssignment = node.getFirstAncestorByKind(
            tsMorph.SyntaxKind.ExportAssignment
          )
          if (exportAssignment && !exportAssignment.isExportEquals()) {
            node = exportAssignment
          }

          // const foo = 1; export { foo } / named var exports
          if (tsMorph.Node.isVariableDeclaration(node)) {
            node = node.getFirstAncestorByKindOrThrow(
              tsMorph.SyntaxKind.VariableStatement
            )
          }

          // export { x } from './y'
          if (tsMorph.Node.isExportSpecifier(node)) {
            const exportDeclaration = node.getFirstAncestorByKind(
              tsMorph.SyntaxKind.ExportDeclaration
            )
            if (exportDeclaration) {
              node = exportDeclaration
            }
          }

          const fileExport: FileExport = {
            name,
            path: node.getSourceFile().getFilePath(),
            position: node.getPos(),
            kind: node.getKind(),
          }
          let insertAt = exportDeclarations.length

          for (let index = 0; index < insertAt; index++) {
            const existing = exportDeclarations[index]
            const isPathBefore =
              fileExport.path.localeCompare(existing.path) < 0
            const isSamePath = fileExport.path === existing.path
            const isPositionBefore = fileExport.position < existing.position

            if (isPathBefore || (isSamePath && isPositionBefore)) {
              insertAt = index
              break
            }
          }

          exportDeclarations.splice(insertAt, 0, fileExport)
        }
      }

      return exportDeclarations
    },
    { data: { filePath } }
  ) as FileExport[]
}

/** Returns a specific export declaration of a file at a given position and kind. */
export function getFileExportDeclaration(
  filePath: string,
  position: number,
  kind: tsMorph.SyntaxKind,
  project: Project
) {
  return debug.trackOperation(
    'get-file-export-declaration',
    () => {
      const sourceFile = project.getSourceFile(filePath)
      if (!sourceFile) {
        throw new Error(`[renoun] Source file not found: ${filePath}`)
      }

      const declaration = sourceFile.getDescendantAtPos(position)
      if (!declaration) {
        throw new Error(
          `[renoun] Declaration not found at position ${position}`
        )
      }

      const exportDeclaration = declaration.getFirstAncestorByKind(kind)
      if (!exportDeclaration) {
        throw new Error(
          `[renoun] Could not resolve type for file path "${filePath}" at position "${position}". No ancestor of kind "${tsMorph.SyntaxKind[kind]}" was found starting from: "${declaration.getText()}".`
        )
      }

      debug.debug('Found export declaration', {
        operation: 'get-file-export-declaration',
        data: {
          filePath,
          position,
          kind: tsMorph.SyntaxKind[kind],
          declarationText: declaration.getText().substring(0, 100),
        },
      })

      return exportDeclaration
    },
    {
      data: { filePath, position, kind: tsMorph.SyntaxKind[kind] },
    }
  ) as tsMorph.Node
}

/** Returns metadata about a specific export of a file. */
export async function getFileExportMetadata(
  name: string,
  filePath: string,
  position: number,
  kind: tsMorph.SyntaxKind,
  project: Project
) {
  return debug.trackAsyncOperation(
    'get-file-export-metadata',
    async () => {
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

      const metadata = {
        name: getName(
          sourceFile.getBaseNameWithoutExtension(),
          name,
          exportDeclaration
        ),
        environment: getEnvironment(exportDeclaration),
        jsDocMetadata: getJsDocMetadata(exportDeclaration),
        location: getDeclarationLocation(exportDeclaration),
      }

      debug.info('Export metadata retrieved', {
        operation: 'get-file-export-metadata',
        data: {
          filePath,
          exportName: name,
          resolvedName: metadata.name,
          environment: metadata.environment,
          hasJsDoc: !!metadata.jsDocMetadata,
          hasLocation: !!metadata.location,
        },
      })

      return metadata
    },
    {
      data: { name, filePath, position, kind: tsMorph.SyntaxKind[kind] },
    }
  )
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
