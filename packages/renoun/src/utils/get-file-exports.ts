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
  type DeclarationPosition,
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
import {
  EXTENSION_PRIORITY,
  INDEX_FILE_CANDIDATES,
  formatExportId,
  looksLikeFilePath,
  parseExportId,
  scanModuleExports,
  type ExportItem,
} from '../file-system/export-analysis.ts'
import { directoryName, joinPaths } from './path.ts'

export interface ModuleExport {
  name: string
  path: string
  position: number
  kind: SyntaxKind
  declarationPosition?: DeclarationPosition
  metadata?: FileExportStaticMetadata
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

export interface FileExportsWithDependenciesResult {
  exports: ModuleExport[]
  dependencies: string[]
}

function readProjectFileIfExists(
  project: Project,
  filePath: string
): string | undefined {
  const sourceFile = project.getSourceFile(filePath)
  if (sourceFile) {
    return sourceFile.getFullText()
  }

  try {
    return project.getFileSystem().readFileSync(filePath)
  } catch {
    return undefined
  }
}

function resolveRelativeModulePath(
  project: Project,
  filePath: string,
  specifier: string
): string | undefined {
  if (!specifier.startsWith('.')) {
    return undefined
  }

  const fileSystem = project.getFileSystem()
  const basePath = joinPaths(directoryName(filePath), specifier)
  const candidates = new Set<string>()

  if (looksLikeFilePath(specifier)) {
    candidates.add(basePath)
  } else {
    for (const extension of EXTENSION_PRIORITY) {
      candidates.add(`${basePath}${extension}`)
    }

    for (const indexFileCandidate of INDEX_FILE_CANDIDATES) {
      candidates.add(joinPaths(basePath, indexFileCandidate))
    }
  }

  for (const candidate of candidates) {
    if (
      project.getSourceFile(candidate) ||
      fileSystem.fileExistsSync(candidate)
    ) {
      return candidate
    }
  }

  return undefined
}

function shouldUseRawExportFastPath(rawExports: Map<string, ExportItem>) {
  let relativeReexportCount = 0

  for (const [, item] of rawExports) {
    if (item.id === '__LOCAL__') {
      continue
    }

    if (item.id.startsWith('__NAMESPACE__')) {
      const specifier = item.id.slice('__NAMESPACE__'.length)
      if (!specifier.startsWith('.')) {
        return false
      }
      relativeReexportCount += 1
      continue
    }

    if (item.id.startsWith('__FROM__')) {
      const specifier = item.id.slice(8)
      if (!specifier.startsWith('.')) {
        return false
      }
      relativeReexportCount += 1
      continue
    }

    if (item.id.startsWith('__STAR__')) {
      const specifier = item.id.slice(8)
      if (!specifier.startsWith('.')) {
        return false
      }
      relativeReexportCount += 1
    }
  }

  return relativeReexportCount > 0
}

function sortModuleExports(exports: ModuleExport[]) {
  exports.sort((first, second) => {
    const pathComparison = first.path.localeCompare(second.path)
    if (pathComparison !== 0) {
      return pathComparison
    }

    return first.position - second.position
  })

  return exports
}

function resolveRawExportsFromProject(
  filePath: string,
  rawExports: Map<string, ExportItem>,
  project: Project,
  cache: Map<string, Map<string, ExportItem>>,
  visiting: Set<string>,
  dependencies: Set<string>
): Map<string, ExportItem> | undefined {
  if (visiting.has(filePath)) {
    return new Map()
  }

  dependencies.add(filePath)
  const fileIdentity = (name: string) => formatExportId(filePath, name)
  const results = new Map<string, ExportItem>()
  const localExports: Array<[string, ExportItem]> = []
  const fromExports: Array<[string, ExportItem, string]> = []
  const namespaceExports: Array<[string, ExportItem, string]> = []
  const starExports: Array<[string, ExportItem, string]> = []

  for (const [name, rawItem] of rawExports) {
    if (rawItem.id === '__LOCAL__') {
      localExports.push([name, rawItem])
      continue
    }

    if (rawItem.id.startsWith('__FROM__')) {
      fromExports.push([name, rawItem, rawItem.id.slice(8)])
      continue
    }

    if (rawItem.id.startsWith('__NAMESPACE__')) {
      namespaceExports.push([
        name,
        rawItem,
        rawItem.id.slice('__NAMESPACE__'.length),
      ])
      continue
    }

    if (rawItem.id.startsWith('__STAR__')) {
      starExports.push([name, rawItem, rawItem.id.slice(8)])
      continue
    }

    return undefined
  }

  for (const [name, rawItem] of localExports) {
    results.set(name, { ...rawItem, id: fileIdentity(name) })
  }

  const nextVisiting = new Set(visiting)
  nextVisiting.add(filePath)
  const childExportMaps = new Map<string, Map<string, ExportItem>>()
  const externalSpecifiers = new Set<string>()

  for (const [, , specifier] of fromExports) {
    externalSpecifiers.add(specifier)
  }
  for (const [, , specifier] of namespaceExports) {
    externalSpecifiers.add(specifier)
  }
  for (const [, , specifier] of starExports) {
    externalSpecifiers.add(specifier)
  }

  for (const specifier of externalSpecifiers) {
    const resolvedPath = resolveRelativeModulePath(project, filePath, specifier)

    if (!resolvedPath) {
      return undefined
    }

    dependencies.add(resolvedPath)

    if (!childExportMaps.has(resolvedPath)) {
      let childExports = cache.get(resolvedPath)

      if (!childExports) {
        const childContent = readProjectFileIfExists(project, resolvedPath)
        if (!childContent) {
          return undefined
        }

        const childRawExports = scanModuleExports(resolvedPath, childContent, {
          includeHashes: false,
          includeLines: false,
          includeDeprecation: false,
        })
        childExports = resolveRawExportsFromProject(
          resolvedPath,
          childRawExports,
          project,
          cache,
          nextVisiting,
          dependencies
        )

        if (!childExports) {
          return undefined
        }

        cache.set(resolvedPath, childExports)
      }

      childExportMaps.set(resolvedPath, childExports)
    }
  }

  for (const [name, rawItem, specifier] of fromExports) {
    const resolvedPath = resolveRelativeModulePath(project, filePath, specifier)
    const childExports =
      resolvedPath !== undefined ? childExportMaps.get(resolvedPath) : undefined
    const sourceName = rawItem.sourceName ?? name
    const targetExport = childExports?.get(sourceName)

    if (!targetExport) {
      return undefined
    }

    results.set(name, targetExport)
  }

  for (const [name, rawItem, specifier] of namespaceExports) {
    const resolvedPath = resolveRelativeModulePath(project, filePath, specifier)

    if (
      !resolvedPath ||
      rawItem.position === undefined ||
      rawItem.syntaxKind === undefined
    ) {
      return undefined
    }

    results.set(name, {
      ...rawItem,
      id: fileIdentity(name),
    })
  }

  for (const [, , specifier] of starExports) {
    const resolvedPath = resolveRelativeModulePath(project, filePath, specifier)
    const childExports =
      resolvedPath !== undefined ? childExportMaps.get(resolvedPath) : undefined

    if (!childExports) {
      return undefined
    }

    for (const [childName, childExport] of childExports) {
      if (childName !== 'default' && !results.has(childName)) {
        results.set(childName, childExport)
      }
    }
  }

  return results
}

function tryGetRawFileExportsWithDependencies(
  filePath: string,
  project: Project
): FileExportsWithDependenciesResult | undefined {
  const sourceFile = ensureProjectSourceFile(filePath, project)
  const rawExports = scanModuleExports(filePath, sourceFile.getFullText(), {
    includeHashes: false,
    includeLines: false,
    includeDeprecation: false,
  })

  if (!shouldUseRawExportFastPath(rawExports)) {
    return undefined
  }

  const dependencies = new Set<string>([filePath])
  const resolvedExports = resolveRawExportsFromProject(
    filePath,
    rawExports,
    project,
    new Map(),
    new Set(),
    dependencies
  )

  if (!resolvedExports) {
    return undefined
  }

  const exportDeclarations: ModuleExport[] = []

  for (const [name, item] of resolvedExports) {
    const parsed = parseExportId(item.id)

    if (
      !parsed ||
      item.position === undefined ||
      item.syntaxKind === undefined
    ) {
      return undefined
    }

    exportDeclarations.push({
      name,
      path: parsed.file,
      position: item.position,
      kind: item.syntaxKind,
      declarationPosition: item.declarationPosition,
    })
  }

  return {
    exports: sortModuleExports(exportDeclarations),
    dependencies: Array.from(dependencies),
  }
}

/** Returns metadata about the exports of a file. */
export function getFileExportsWithDependencies(
  filePath: string,
  project: Project
): FileExportsWithDependenciesResult {
  const startedAt = performance.now()
  const fields = {
    filePathHash: hashString(filePath).slice(0, 12),
  }

  try {
    const result = getDebugLogger().trackOperation(
      'get-file-exports',
      () => {
        const fastPathResult = tryGetRawFileExportsWithDependencies(
          filePath,
          project
        )

        if (fastPathResult) {
          return fastPathResult
        }

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

          exportDeclarations.push({
            name,
            path: node.getSourceFile().getFilePath(),
            position: getExportPosition(node),
            kind: node.getKind(),
            metadata: createFileExportMetadata(
              node.getSourceFile().getBaseNameWithoutExtension(),
              name,
              node
            ),
          })
        }

        return {
          exports: sortModuleExports(exportDeclarations),
          dependencies: Array.from(
            new Set<string>([filePath, ...exportDeclarations.map((item) => item.path)])
          ),
        }
      },
      { data: { filePath } }
    ) as FileExportsWithDependenciesResult

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
        exportCount: result.exports.length,
      },
    })

    return result
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

export function getFileExports(
  filePath: string,
  project: Project
): ModuleExport[] {
  return getFileExportsWithDependencies(filePath, project).exports
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
