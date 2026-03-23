import { getTsMorph } from './ts-morph.ts'
import type {
  Node,
  Project,
  SourceFile,
  Symbol as TsMorphSymbol,
  SyntaxKind,
} from './ts-morph.ts'

const tsMorph = getTsMorph()

import { getDebugLogger } from './debug.ts'
import {
  getDeclarationLocation,
  type DeclarationLocation,
} from './get-declaration-location.ts'
import { getExportPosition } from './get-export-position.ts'
import { getJsDocMetadata } from './get-js-doc-metadata.ts'
import { hashString } from './stable-serialization.ts'
import {
  emitTelemetryCounter,
  emitTelemetryEvent,
  emitTelemetryHistogram,
} from './telemetry.ts'

export interface ModuleExport {
  name: string
  path: string
  position: number
  kind: SyntaxKind
  metadata: FileExportStaticMetadata
}

export interface FileExportStaticMetadata {
  name: string
  environment: ReturnType<typeof getEnvironment>
  jsDocMetadata: ReturnType<typeof getJsDocMetadata>
  location: DeclarationLocation
}

const exportableKinds = new Set([
  tsMorph.SyntaxKind.ExportAssignment,
  tsMorph.SyntaxKind.ExportDeclaration,
  tsMorph.SyntaxKind.ExportSpecifier,
  tsMorph.SyntaxKind.ClassDeclaration,
  tsMorph.SyntaxKind.EnumDeclaration,
  tsMorph.SyntaxKind.FunctionDeclaration,
  tsMorph.SyntaxKind.VariableDeclaration,
  tsMorph.SyntaxKind.InterfaceDeclaration,
  tsMorph.SyntaxKind.TypeAliasDeclaration,
])

/** Returns metadata about the exports of a file. */
export function getFileExports(
  filePath: string,
  project: Project
): ModuleExport[] {
  const startedAt = performance.now()
  const fields = {
    filePathHash: hashString(filePath).slice(0, 12),
  }

  try {
    const exports = getDebugLogger().trackOperation(
      'get-file-exports',
      () => {
        const sourceFile = ensureProjectSourceFile(filePath, project)

        const processStart = performance.now()
        const exportDeclarations: ModuleExport[] = []
        const exportSymbols = sourceFile.getExportSymbols()
        const totalDeclarations = exportSymbols.length

        getDebugLogger().debug('Processing exported declarations', () => ({
          operation: 'get-file-exports',
          data: {
            filePath,
            totalDeclarations,
            hasSourceFile: Boolean(sourceFile),
            duration: (performance.now() - processStart).toFixed(1),
          },
        }))

        for (const exportSymbol of exportSymbols) {
          const name = getExportSymbolName(exportSymbol)
          const node = getExportDeclarationForSymbol(exportSymbol)

          if (!name || !node) {
            continue
          }

          const fileExport: ModuleExport = {
            name,
            path: node.getSourceFile().getFilePath(),
            position: getExportPosition(node),
            kind: node.getKind(),
            metadata: createFileExportMetadata(
              node.getSourceFile().getBaseNameWithoutExtension(),
              name,
              node
            ),
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

        return exportDeclarations
      },
      { data: { filePath } }
    ) as ModuleExport[]

    const durationMs = performance.now() - startedAt
    emitTelemetryHistogram({
      name: 'renoun.analysis.file_exports_ms',
      value: durationMs,
    })
    emitTelemetryEvent({
      name: 'renoun.analysis.file_exports',
      fields: {
        ...fields,
        durationMs,
        exportCount: exports.length,
      },
    })

    return exports
  } catch (error) {
    const durationMs = performance.now() - startedAt
    emitTelemetryCounter({
      name: 'renoun.analysis.file_exports_error_count',
    })
    emitTelemetryEvent({
      name: 'renoun.analysis.file_exports_error',
      fields: {
        ...fields,
        durationMs,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
    })
    throw error
  }
}

export function ensureProjectSourceFile(
  filePath: string,
  project: Project
): SourceFile {
  let sourceFile = project.getSourceFile(filePath)

  if (!sourceFile) {
    const addStart = performance.now()
    sourceFile = project.addSourceFileAtPath(filePath)

    getDebugLogger().debug('Added source file to project', () => ({
      operation: 'ensure-project-source-file',
      data: {
        filePath,
        wasAdded: true,
        duration: (performance.now() - addStart).toFixed(1),
        projectFiles: project.getSourceFiles().length,
      },
    }))
  }

  return sourceFile
}

/**
 * Selects the preferred declaration from a list of declarations.
 *
 * - Classes are preferred over other declarations.
 * - Type-like declarations (interfaces, enums, type aliases) are preferred over function declarations.
 * - Function declarations with a body are preferred over function declarations without a body.
 * - The first declaration is preferred if no other declaration is preferred.
 */
function selectPreferredDeclaration(declarations: Node[]) {
  let typeLike: Node | undefined
  let functionWithBody: Node | undefined
  let firstDeclaration: Node | undefined

  for (const declaration of declarations) {
    if (tsMorph.Node.isClassDeclaration(declaration)) {
      return declaration
    }

    if (
      tsMorph.Node.isInterfaceDeclaration(declaration) ||
      tsMorph.Node.isEnumDeclaration(declaration) ||
      tsMorph.Node.isTypeAliasDeclaration(declaration)
    ) {
      if (!typeLike) {
        typeLike = declaration
      }
    }

    if (
      tsMorph.Node.isFunctionDeclaration(declaration) &&
      declaration.getBody()
    ) {
      if (!functionWithBody) {
        functionWithBody = declaration
      }
    }

    if (!firstDeclaration) {
      firstDeclaration = declaration
    }
  }

  return typeLike ?? functionWithBody ?? firstDeclaration ?? declarations[0]!
}

function getExportSymbolName(
  exportSymbol: TsMorphSymbol
): string | undefined {
  const name = exportSymbol.getName()

  if (!name || name.startsWith('__')) {
    return undefined
  }

  return name
}

function normalizeExportDeclarationNode(node: Node): Node | undefined {
  let normalizedNode: Node = node

  const exportAssignment = normalizedNode.getFirstAncestorByKind(
    tsMorph.SyntaxKind.ExportAssignment
  )
  if (exportAssignment && !exportAssignment.isExportEquals()) {
    normalizedNode = exportAssignment
  }

  if (tsMorph.Node.isVariableStatement(normalizedNode)) {
    const declarations = normalizedNode.getDeclarationList().getDeclarations()

    if (declarations.length > 1) {
      throw new Error(
        `[renoun] Multiple variable declarations found in variable statement which is not currently supported: ${normalizedNode.getText()}`
      )
    }

    normalizedNode = declarations.at(0)!
  }

  if (
    tsMorph.Node.isExportSpecifier(normalizedNode) ||
    tsMorph.Node.isNamespaceExport(normalizedNode)
  ) {
    const exportDeclaration = normalizedNode.getFirstAncestorByKind(
      tsMorph.SyntaxKind.ExportDeclaration
    )
    if (exportDeclaration) {
      normalizedNode = exportDeclaration
    }
  }

  if (!exportableKinds.has(normalizedNode.getKind())) {
    return undefined
  }

  return normalizedNode
}

function getExportDeclarationForSymbol(
  exportSymbol: TsMorphSymbol
): Node | undefined {
  const aliasedSymbol = safeRead(() => exportSymbol.getAliasedSymbol?.())
  const targetDeclarations =
    aliasedSymbol?.getDeclarations() ?? exportSymbol.getDeclarations()

  if (targetDeclarations.length > 0) {
    const normalizedTarget = normalizeExportDeclarationNode(
      selectPreferredDeclaration(targetDeclarations)
    )

    if (normalizedTarget) {
      return normalizedTarget
    }
  }

  const symbolDeclarations = exportSymbol.getDeclarations()
  if (symbolDeclarations.length > 0) {
    return normalizeExportDeclarationNode(
      selectPreferredDeclaration(symbolDeclarations)
    )
  }

  return undefined
}

/** Returns a specific export declaration of a file at a given position and kind. */
export function getFileExportDeclaration(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  project: Project
) {
  return getDebugLogger().trackOperation(
    'get-file-export-declaration',
    () => {
      const sourceFile = ensureProjectSourceFile(filePath, project)

      const declaration = sourceFile.getDescendantAtPos(position)
      if (!declaration) {
        throw new Error(
          `[renoun] Declaration not found at position ${position}`
        )
      }

      // If the node at this position already matches the requested kind, use it directly.
      if (declaration.getKind() === kind) {
        return declaration
      }

      // Otherwise, find the nearest ancestor of the requested kind.
      const exportDeclaration = declaration.getFirstAncestorByKind(kind)
      if (!exportDeclaration) {
        throw new Error(
          `[renoun] Could not resolve type for file path "${filePath}" at position "${position}". No ancestor of kind "${tsMorph.SyntaxKind[kind]}" was found starting from: "${declaration.getText()}".`
        )
      }

      getDebugLogger().debug('Found export declaration', () => ({
        operation: 'get-file-export-declaration',
        data: {
          filePath,
          position,
          kind: tsMorph.SyntaxKind[kind],
          declarationText: declaration.getText().substring(0, 100),
        },
      }))

      return exportDeclaration
    },
    {
      data: {
        filePath,
        position,
        kind: tsMorph.SyntaxKind[kind],
      },
    }
  ) as Node
}

/** Returns metadata about a specific export of a file. */
export async function getFileExportMetadata(
  name: string,
  filePath: string,
  position: number,
  kind: SyntaxKind,
  project: Project
): Promise<FileExportStaticMetadata> {
  const startedAt = performance.now()
  const fields = {
    filePathHash: hashString(filePath).slice(0, 12),
    kind: tsMorph.SyntaxKind[kind],
  }

  try {
    const metadata = await getDebugLogger().trackOperation(
      'get-file-export-metadata',
      async () => {
        const sourceFile = ensureProjectSourceFile(filePath, project)

        const exportDeclaration = getFileExportDeclaration(
          filePath,
          position,
          kind,
          project
        )

        const metadata = createFileExportMetadata(
          sourceFile.getBaseNameWithoutExtension(),
          name,
          exportDeclaration
        )

        getDebugLogger().info('Export metadata retrieved', () => ({
          operation: 'get-file-export-metadata',
          data: {
            filePath,
            exportName: name,
            resolvedName: metadata.name,
            environment: metadata.environment,
            hasJsDoc: !!metadata.jsDocMetadata,
            hasLocation: !!metadata.location,
          },
        }))

        return metadata
      },
      {
        data: { name, filePath, position, kind: tsMorph.SyntaxKind[kind] },
      }
    )

    const durationMs = performance.now() - startedAt
    emitTelemetryHistogram({
      name: 'renoun.analysis.file_export_metadata_ms',
      value: durationMs,
      tags: {
        kind: fields.kind,
      },
    })
    emitTelemetryEvent({
      name: 'renoun.analysis.file_export_metadata',
      tags: {
        kind: fields.kind,
      },
      fields: {
        ...fields,
        durationMs,
        hasJsDoc: Boolean(metadata.jsDocMetadata),
        hasLocation: Boolean(metadata.location),
      },
    })

    return metadata
  } catch (error) {
    const durationMs = performance.now() - startedAt
    emitTelemetryCounter({
      name: 'renoun.analysis.file_export_metadata_error_count',
      tags: {
        kind: fields.kind,
      },
    })
    emitTelemetryEvent({
      name: 'renoun.analysis.file_export_metadata_error',
      tags: {
        kind: fields.kind,
      },
      fields: {
        ...fields,
        durationMs,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
    })
    throw error
  }
}

function createFileExportMetadata(
  fileName: string,
  exportName: string,
  exportDeclaration: Node
): FileExportStaticMetadata {
  return {
    name: getName(fileName, exportName, exportDeclaration),
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

function safeRead<Value>(read: () => Value): Value | undefined {
  try {
    return read()
  } catch {
    return undefined
  }
}
