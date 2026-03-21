import { dirname, isAbsolute, resolve } from 'node:path'

import { isFilePathGitIgnored } from '../../utils/is-file-path-git-ignored.ts'
import { hasJavaScriptLikeExtension } from '../../utils/is-javascript-like-extension.ts'
import { ensureRelativePath, resolveSchemePath } from '../../utils/path.ts'
import {
  resolveLiteralExpression,
  type LiteralExpressionValue,
} from '../../utils/resolve-expressions.ts'
import { getTsMorph } from '../../utils/ts-morph.ts'
import type { AnalysisOptions } from '../../analysis/types.ts'
import type {
  Expression,
  CallExpression,
  Project,
  SourceFile,
  Symbol as TsMorphSymbol,
} from '../../utils/ts-morph.ts'

const { Node } = getTsMorph()

const PREWARM_COLLECTION_YIELD_INTERVAL = 128
const NODE_MODULES_PATH = '/node_modules/'

interface RenounAliases {
  directoryConstructors: Set<string>
  collectionConstructors: Set<string>
  repositoryConstructors: Set<string>
  namespaceImports: Set<string>
}

interface RenounDirectoryDeclaration {
  path: string
  sparsePath: string
  repository?: RenounRepositoryDeclaration
}

interface RenounCollectionDeclaration {
  entries: RenounCollectionEntryReference[]
}

type PrewarmRepositoryInput = string | Record<string, unknown>

interface RenounRepositoryDeclaration {
  input: PrewarmRepositoryInput
  sparsePaths: Set<string>
}

type RenounCollectionEntryReference =
  | { kind: 'directory'; symbol: TsMorphSymbol }
  | { kind: 'directoryPath'; path: string }
  | { kind: 'collection'; symbol: TsMorphSymbol }

export interface DirectoryEntriesRequest {
  directoryPath: string
  recursive: boolean
  includeDirectoryNamedFiles: boolean
  includeIndexAndReadmeFiles: boolean
  filterExtensions: Set<string> | null
}

export interface FileRequest {
  directoryPath: string
  path: string
  extensions?: string[]
}

export interface ExportHistoryRequest {
  repository: PrewarmRepositoryInput
  sparsePaths?: string[]
  options?: Record<string, unknown>
}

type RenounMethodTarget =
  | {
      kind: 'directory'
      declaration: RenounDirectoryDeclaration
    }
  | {
      kind: 'collection'
      symbol: TsMorphSymbol
    }

export interface RenounPrewarmTargets {
  directoryGetEntries: DirectoryEntriesRequest[]
  fileGetFile: FileRequest[]
  exportHistory: ExportHistoryRequest[]
}

type PendingRenounCallsite = {
  callExpression: CallExpression
  methodName: 'getEntries' | 'getFile' | 'getExportHistory'
  aliases: RenounAliases
}

const EMPTY_RENOUN_ALIASES: RenounAliases = {
  directoryConstructors: new Set(),
  collectionConstructors: new Set(),
  repositoryConstructors: new Set(),
  namespaceImports: new Set(),
}

/**
 * Collect `Directory`/`Collection` callsites for prewarming from the provided project.
 */
export async function collectRenounPrewarmTargets(
  project: Project,
  analysisOptions?: AnalysisOptions
): Promise<RenounPrewarmTargets> {
  const directoryDeclarations = new Map<
    TsMorphSymbol,
    RenounDirectoryDeclaration
  >()
  const repositoryDeclarations = new Map<
    TsMorphSymbol,
    RenounRepositoryDeclaration
  >()
  const collectionRawEntries = new Map<TsMorphSymbol, Expression[]>()
  const collectionAliases = new Map<TsMorphSymbol, RenounAliases>()
  const collectionDeclarations = new Map<
    TsMorphSymbol,
    RenounCollectionDeclaration
  >()

  const getEntriesRequests = new Map<string, DirectoryEntriesRequest>()
  const getFileRequests: FileRequest[] = []
  const exportHistoryRequests: ExportHistoryRequest[] = []
  const pendingCallsites: PendingRenounCallsite[] = []
  const collectionGetEntriesRequests = new Map<
    TsMorphSymbol,
    Omit<DirectoryEntriesRequest, 'directoryPath'>
  >()

  const workspaceDirectory = analysisOptions?.tsConfigFilePath
    ? dirname(analysisOptions.tsConfigFilePath)
    : process.cwd()
  const sourceFiles = project.getSourceFiles()

  for (const [index, sourceFile] of sourceFiles.entries()) {
    if (index > 0 && index % PREWARM_COLLECTION_YIELD_INTERVAL === 0) {
      await new Promise((resolvePromise) => setImmediate(resolvePromise))
    }

    const sourceFilePath = sourceFile.getFilePath()
    if (!hasJavaScriptLikeExtension(sourceFilePath)) {
      continue
    }

    if (shouldSkipSourceFile(sourceFilePath)) {
      continue
    }

    if (!isLikelyRenounSourceFile(sourceFile)) {
      continue
    }

    const aliases = getRenounAliases(sourceFile)

    collectRenounDeclarations(
      sourceFile,
      aliases,
      workspaceDirectory,
      directoryDeclarations,
      repositoryDeclarations,
      collectionRawEntries,
      collectionAliases,
      pendingCallsites
    )
  }

  for (const collectionSymbol of collectionRawEntries.keys()) {
    if (!collectionDeclarations.has(collectionSymbol)) {
      collectionDeclarations.set(collectionSymbol, { entries: [] })
    }
  }

  for (const [collectionSymbol, rawEntries] of collectionRawEntries.entries()) {
    const aliases =
      collectionAliases.get(collectionSymbol) ?? EMPTY_RENOUN_ALIASES

    const resolvedEntries = rawEntries
      .map((entryExpression) =>
        resolveCollectionEntryReference(entryExpression, {
          directories: directoryDeclarations,
          collections: collectionDeclarations,
          workspaceDirectory,
          aliases,
        })
      )
      .filter(
        (entry): entry is RenounCollectionEntryReference => entry !== undefined
      )

    const declaration = collectionDeclarations.get(collectionSymbol)
    if (declaration) {
      declaration.entries = resolvedEntries
    } else {
      collectionDeclarations.set(collectionSymbol, {
        entries: resolvedEntries,
      })
    }
  }

  for (const { callExpression, methodName, aliases } of pendingCallsites) {
    const callExpressionTarget = callExpression.getExpression()
    if (!Node.isPropertyAccessExpression(callExpressionTarget)) {
      continue
    }

    if (methodName === 'getExportHistory') {
      const repositoryTarget = resolveRenounRepositoryTarget(
        callExpressionTarget.getExpression(),
        aliases,
        {
          directories: directoryDeclarations,
          collections: collectionDeclarations,
          repositories: repositoryDeclarations,
          workspaceDirectory,
        }
      )

      if (!repositoryTarget) {
        continue
      }

      const options = resolveExportHistoryOptions(callExpression)
      exportHistoryRequests.push({
        repository: repositoryTarget.input,
        sparsePaths: Array.from(repositoryTarget.sparsePaths).sort(),
        ...(options ? { options } : {}),
      })
      continue
    }

    const methodTarget = resolveRenounMethodTarget(
      callExpressionTarget.getExpression(),
      aliases,
      {
        directories: directoryDeclarations,
        collections: collectionDeclarations,
        workspaceDirectory,
      }
    )

    if (!methodTarget) {
      continue
    }

    if (methodName === 'getEntries') {
      const options = resolveDirectoryGetEntriesOptions(callExpression)

      if (methodTarget.kind === 'directory') {
        addDirectoryEntriesRequest(getEntriesRequests, {
          directoryPath: methodTarget.declaration.path,
          recursive: options.recursive,
          includeDirectoryNamedFiles: options.includeDirectoryNamedFiles,
          includeIndexAndReadmeFiles: options.includeIndexAndReadmeFiles,
          filterExtensions: options.filterExtensions,
        })
        continue
      }

      mergeCollectionGetEntriesRequest(
        collectionGetEntriesRequests,
        methodTarget.symbol,
        {
          recursive: options.recursive,
          includeDirectoryNamedFiles: options.includeDirectoryNamedFiles,
          includeIndexAndReadmeFiles: options.includeIndexAndReadmeFiles,
          filterExtensions: options.filterExtensions,
        }
      )
      continue
    }

    const fileRequest = resolveGetFileCall(callExpression, methodTarget)

    if (fileRequest !== undefined) {
      getFileRequests.push(fileRequest)
    }
  }

  for (const [
    collectionSymbol,
    options,
  ] of collectionGetEntriesRequests.entries()) {
    expandCollectionEntries(
      collectionSymbol,
      options,
      {
        collections: collectionDeclarations,
        directories: directoryDeclarations,
      },
      getEntriesRequests,
      new Set<TsMorphSymbol>()
    )
  }

  return {
    directoryGetEntries: Array.from(getEntriesRequests.values()),
    fileGetFile: getFileRequests,
    exportHistory: exportHistoryRequests,
  }
}

function getRenounAliases(sourceFile: SourceFile): RenounAliases {
  const aliases: RenounAliases = {
    directoryConstructors: new Set<string>(),
    collectionConstructors: new Set<string>(),
    repositoryConstructors: new Set<string>(),
    namespaceImports: new Set<string>(),
  }

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    if (!isRenounImportSpecifier(importDeclaration.getModuleSpecifierValue())) {
      continue
    }

    if (importDeclaration.isTypeOnly()) {
      continue
    }

    for (const namedImport of importDeclaration.getNamedImports()) {
      const name = namedImport.getName()
      if (name === 'Directory') {
        aliases.directoryConstructors.add(
          namedImport.getAliasNode()?.getText() ?? name
        )
      }

      if (name === 'Collection') {
        aliases.collectionConstructors.add(
          namedImport.getAliasNode()?.getText() ?? name
        )
      }

      if (name === 'Repository') {
        aliases.repositoryConstructors.add(
          namedImport.getAliasNode()?.getText() ?? name
        )
      }
    }

    const namespaceImport = importDeclaration.getNamespaceImport()
    if (namespaceImport) {
      aliases.namespaceImports.add(namespaceImport.getText())
    }
  }

  return aliases
}

function isRenounImportSpecifier(moduleSpecifier: string): boolean {
  return moduleSpecifier === 'renoun' || moduleSpecifier.startsWith('renoun/')
}

function collectRenounDeclarations(
  sourceFile: SourceFile,
  aliases: RenounAliases,
  workspaceDirectory: string,
  directoryDeclarations: Map<TsMorphSymbol, RenounDirectoryDeclaration>,
  repositoryDeclarations: Map<TsMorphSymbol, RenounRepositoryDeclaration>,
  collectionRawEntries: Map<TsMorphSymbol, Expression[]>,
  collectionAliases: Map<TsMorphSymbol, RenounAliases>,
  pendingCallsites: PendingRenounCallsite[]
): void {
  sourceFile.forEachDescendant((node) => {
    if (Node.isVariableDeclaration(node)) {
      const initializer = node.getInitializer()
      if (!initializer) {
        return
      }

      const referenceExpression = resolveReferenceExpression(initializer)
      const symbol = node.getSymbol()

      if (Node.isNewExpression(referenceExpression)) {
        if (!symbol) {
          return
        }

        if (
          isDirectoryConstructorExpression(
            referenceExpression.getExpression(),
            aliases
          )
        ) {
          const declaration = resolveDirectoryDeclarationFromNewExpression(
            referenceExpression,
            aliases,
            workspaceDirectory,
            repositoryDeclarations
          )

          if (declaration !== undefined) {
            directoryDeclarations.set(symbol, declaration)
            return
          }
        }

        if (
          isCollectionConstructorExpression(
            referenceExpression.getExpression(),
            aliases
          )
        ) {
          const entries =
            resolveCollectionEntriesFromNewExpression(referenceExpression)

          collectionRawEntries.set(symbol, entries)
          collectionAliases.set(symbol, aliases)
        }
      }

      if (symbol) {
        const repositoryDeclaration = resolveRenounRepositoryTarget(
          referenceExpression,
          aliases,
          {
            directories: directoryDeclarations,
            collections: new Map(),
            repositories: repositoryDeclarations,
            workspaceDirectory,
          }
        )

        if (repositoryDeclaration) {
          repositoryDeclarations.set(symbol, repositoryDeclaration)
          return
        }
      }
    }

    if (!Node.isCallExpression(node)) {
      return
    }

    const expression = node.getExpression()
    if (!Node.isPropertyAccessExpression(expression)) {
      return
    }

    const methodName = expression.getName()
    if (
      methodName !== 'getEntries' &&
      methodName !== 'getFile' &&
      methodName !== 'getExportHistory'
    ) {
      return
    }

    pendingCallsites.push({
      callExpression: node,
      methodName,
      aliases,
    })
  })
}

function isLikelyRenounSourceFile(sourceFile: SourceFile): boolean {
  const sourceText = sourceFile.getFullText()

  return (
    sourceText.includes('renoun') ||
    sourceText.includes('Directory') ||
    sourceText.includes('Collection') ||
    sourceText.includes('Repository') ||
    sourceText.includes('getRepository') ||
    sourceText.includes('getExportHistory') ||
    sourceText.includes('getEntries') ||
    sourceText.includes('getFile')
  )
}

function resolveCollectionEntriesFromNewExpression(
  newExpression: Expression
): Expression[] {
  const expression = resolveReferenceExpression(newExpression)
  if (!Node.isNewExpression(expression)) {
    return []
  }

  const firstArgument = expression.getArguments()[0]
  if (!firstArgument || !Node.isObjectLiteralExpression(firstArgument)) {
    return []
  }

  const entriesProperty = firstArgument.getProperty('entries')
  if (!entriesProperty || !Node.isPropertyAssignment(entriesProperty)) {
    return []
  }

  const entriesInitializer = entriesProperty.getInitializer()
  if (!entriesInitializer) {
    return []
  }

  if (Node.isArrayLiteralExpression(entriesInitializer)) {
    return entriesInitializer.getElements()
  }

  if (Node.isIdentifier(entriesInitializer)) {
    const symbol = entriesInitializer.getSymbol()
    if (!symbol) {
      return []
    }

    const declaration = symbol.getDeclarations()[0]
    if (Node.isVariableDeclaration(declaration)) {
      const initializer = declaration.getInitializer()
      if (initializer && Node.isArrayLiteralExpression(initializer)) {
        return initializer.getElements()
      }
    }
  }

  return []
}

function resolveCollectionEntryReference(
  expression: Expression,
  references: {
    directories: Map<TsMorphSymbol, RenounDirectoryDeclaration>
    collections: Map<TsMorphSymbol, RenounCollectionDeclaration>
    workspaceDirectory: string
    aliases: RenounAliases
  }
): RenounCollectionEntryReference | undefined {
  const resolved = resolveReferenceExpression(expression)

  if (Node.isIdentifier(resolved)) {
    const symbol = resolveRenounSymbol(resolved.getSymbol())
    if (!symbol) {
      return undefined
    }

    if (references.directories.has(symbol)) {
      return {
        kind: 'directory',
        symbol,
      }
    }

    if (references.collections.has(symbol)) {
      return {
        kind: 'collection',
        symbol,
      }
    }

    return undefined
  }

  if (Node.isNewExpression(resolved)) {
    if (
      !isDirectoryConstructorExpression(
        resolved.getExpression(),
        references.aliases
      )
    ) {
      return undefined
    }

    const path = resolveDirectoryPathFromNewExpression(
      resolved,
      references.aliases,
      references.workspaceDirectory
    )

    if (!path) {
      return undefined
    }

    return {
      kind: 'directoryPath',
      path,
    }
  }

  return undefined
}

function resolveRenounMethodTarget(
  expression: Expression,
  aliases: RenounAliases,
  references: {
    directories: Map<TsMorphSymbol, RenounDirectoryDeclaration>
    collections: Map<TsMorphSymbol, RenounCollectionDeclaration>
    workspaceDirectory: string
  }
): RenounMethodTarget | undefined {
  const resolved = resolveReferenceExpression(expression)

  if (Node.isIdentifier(resolved)) {
    const symbol = resolveRenounSymbol(resolved.getSymbol())
    if (!symbol) {
      return undefined
    }

    const directoryDeclaration = references.directories.get(symbol)
    if (directoryDeclaration) {
      return {
        kind: 'directory',
        declaration: directoryDeclaration,
      }
    }

    if (references.collections.has(symbol)) {
      return {
        kind: 'collection',
        symbol,
      }
    }

    return undefined
  }

  if (Node.isNewExpression(resolved)) {
    const directoryDeclaration = resolveDirectoryDeclarationFromNewExpression(
      resolved,
      aliases,
      references.workspaceDirectory,
      new Map()
    )

    if (directoryDeclaration) {
      return {
        kind: 'directory',
        declaration: directoryDeclaration,
      }
    }

    return undefined
  }

  return undefined
}

function resolveRenounSymbol(
  symbol?: TsMorphSymbol
): TsMorphSymbol | undefined {
  if (!symbol) {
    return undefined
  }

  const visited = new Set<TsMorphSymbol>()
  let current = symbol

  while (current.isAlias()) {
    const aliasedSymbol = current.getAliasedSymbol()

    if (!aliasedSymbol || visited.has(aliasedSymbol)) {
      return current
    }

    visited.add(current)
    current = aliasedSymbol
  }

  return current
}

function resolveGetFileCall(
  callExpression: CallExpression,
  methodTarget: RenounMethodTarget
): FileRequest | undefined {
  if (methodTarget.kind !== 'directory') {
    return undefined
  }

  const args = callExpression.getArguments()
  const pathArgument = args[0]

  if (!pathArgument || !Node.isExpression(pathArgument)) {
    return undefined
  }

  const pathArg = resolveLiteralExpression(pathArgument)
  if (typeof pathArg !== 'string') {
    return undefined
  }

  const extensionArgument = args[1]
  const extensionExpression = extensionArgument
    ? Node.isExpression(extensionArgument)
      ? extensionArgument
      : undefined
    : undefined
  const extensions = resolveFileExtensionArgument(extensionExpression)
  const directoryPath = methodTarget.declaration.path

  if (!directoryPath) {
    return undefined
  }

  return {
    directoryPath,
    path: pathArg,
    extensions,
  }
}

function resolveFileExtensionArgument(
  extensionExpression: Expression | undefined
): string[] | undefined {
  if (!extensionExpression) {
    return undefined
  }

  const extension = resolveLiteralExpression(extensionExpression)

  if (typeof extension === 'string') {
    return [extension]
  }

  if (Array.isArray(extension)) {
    const values = extension.filter(
      (value): value is string => typeof value === 'string' && value.length > 0
    )
    return values.length > 0 ? values : undefined
  }

  return undefined
}

function resolveDirectoryGetEntriesOptions(callExpression: CallExpression): {
  recursive: boolean
  includeDirectoryNamedFiles: boolean
  includeIndexAndReadmeFiles: boolean
  filterExtensions: Set<string> | null
} {
  const firstArgument = callExpression.getArguments()[0]
  const optionsArgument =
    firstArgument && Node.isExpression(firstArgument)
      ? firstArgument
      : undefined

  if (!optionsArgument) {
    return {
      recursive: false,
      includeDirectoryNamedFiles: true,
      includeIndexAndReadmeFiles: true,
      filterExtensions: null,
    }
  }

  const value = resolveLiteralExpression(optionsArgument) as
    | LiteralExpressionValue
    | Record<string, unknown>

  if (value === null || typeof value !== 'object') {
    return {
      recursive: false,
      includeDirectoryNamedFiles: true,
      includeIndexAndReadmeFiles: true,
      filterExtensions: null,
    }
  }

  const optionsObject = value as Record<string, unknown>

  const filterExtensions =
    typeof optionsObject['filter'] === 'string'
      ? parseFilterExtensions(optionsObject['filter'])
      : null

  return {
    recursive:
      typeof optionsObject['recursive'] === 'boolean'
        ? optionsObject['recursive']
        : false,
    includeDirectoryNamedFiles:
      typeof optionsObject['includeDirectoryNamedFiles'] === 'boolean'
        ? optionsObject['includeDirectoryNamedFiles']
        : true,
    includeIndexAndReadmeFiles:
      typeof optionsObject['includeIndexAndReadmeFiles'] === 'boolean'
        ? optionsObject['includeIndexAndReadmeFiles']
        : true,
    filterExtensions,
  }
}

function parseFilterExtensions(
  filterValue: string | undefined
): Set<string> | null {
  if (!filterValue) {
    return null
  }

  const trimmed = filterValue.trim()
  const braceMatch = trimmed.match(/\{([^}]+)\}/)

  if (braceMatch) {
    const extensions = braceMatch[1]
      .split(',')
      .map((value) => value.trim().replace(/^\*\./, ''))
      .filter((value) => value.length > 0)
    return new Set(extensions)
  }

  const singleMatch = trimmed.match(/\*\.([a-z0-9_-]+)$/i)
  if (singleMatch) {
    return new Set([singleMatch[1]])
  }

  return null
}

function expandCollectionEntries(
  collectionSymbol: TsMorphSymbol,
  options: Omit<DirectoryEntriesRequest, 'directoryPath'>,
  declarations: {
    collections: Map<TsMorphSymbol, RenounCollectionDeclaration>
    directories: Map<TsMorphSymbol, RenounDirectoryDeclaration>
  },
  getEntriesRequests: Map<string, DirectoryEntriesRequest>,
  visiting: Set<TsMorphSymbol>
): void {
  if (visiting.has(collectionSymbol)) {
    return
  }

  const collectionDeclaration = declarations.collections.get(collectionSymbol)
  if (!collectionDeclaration) {
    return
  }

  visiting.add(collectionSymbol)

  for (const entry of collectionDeclaration.entries) {
    if (entry.kind === 'directory') {
      const directoryDeclaration = declarations.directories.get(entry.symbol)
      if (!directoryDeclaration) {
        continue
      }

      addDirectoryEntriesRequest(getEntriesRequests, {
        directoryPath: directoryDeclaration.path,
        recursive: options.recursive,
        includeDirectoryNamedFiles: options.includeDirectoryNamedFiles,
        includeIndexAndReadmeFiles: options.includeIndexAndReadmeFiles,
        filterExtensions: options.filterExtensions,
      })
      continue
    }

    if (entry.kind === 'directoryPath') {
      addDirectoryEntriesRequest(getEntriesRequests, {
        directoryPath: entry.path,
        recursive: options.recursive,
        includeDirectoryNamedFiles: options.includeDirectoryNamedFiles,
        includeIndexAndReadmeFiles: options.includeIndexAndReadmeFiles,
        filterExtensions: options.filterExtensions,
      })
      continue
    }

    expandCollectionEntries(
      entry.symbol,
      options,
      declarations,
      getEntriesRequests,
      visiting
    )
  }

  visiting.delete(collectionSymbol)
}

function addDirectoryEntriesRequest(
  getEntriesRequests: Map<string, DirectoryEntriesRequest>,
  request: DirectoryEntriesRequest
): void {
  const existing = getEntriesRequests.get(request.directoryPath)
  if (!existing) {
    getEntriesRequests.set(request.directoryPath, {
      ...request,
      filterExtensions:
        request.filterExtensions === null
          ? null
          : new Set(request.filterExtensions),
    })
    return
  }

  existing.recursive = existing.recursive || request.recursive
  existing.includeDirectoryNamedFiles =
    existing.includeDirectoryNamedFiles || request.includeDirectoryNamedFiles
  existing.includeIndexAndReadmeFiles =
    existing.includeIndexAndReadmeFiles || request.includeIndexAndReadmeFiles

  if (existing.filterExtensions === null || request.filterExtensions === null) {
    existing.filterExtensions = null
    return
  }

  for (const extension of request.filterExtensions) {
    existing.filterExtensions.add(extension)
  }
}

function mergeCollectionGetEntriesRequest(
  collectionGetEntriesRequests: Map<
    TsMorphSymbol,
    Omit<DirectoryEntriesRequest, 'directoryPath'>
  >,
  collectionSymbol: TsMorphSymbol,
  options: Omit<DirectoryEntriesRequest, 'directoryPath'>
): void {
  const existing = collectionGetEntriesRequests.get(collectionSymbol)
  if (!existing) {
    collectionGetEntriesRequests.set(collectionSymbol, {
      recursive: options.recursive,
      includeDirectoryNamedFiles: options.includeDirectoryNamedFiles,
      includeIndexAndReadmeFiles: options.includeIndexAndReadmeFiles,
      filterExtensions:
        options.filterExtensions === null
          ? null
          : new Set(options.filterExtensions),
    })
    return
  }

  existing.recursive = existing.recursive || options.recursive
  existing.includeDirectoryNamedFiles =
    existing.includeDirectoryNamedFiles || options.includeDirectoryNamedFiles
  existing.includeIndexAndReadmeFiles =
    existing.includeIndexAndReadmeFiles || options.includeIndexAndReadmeFiles

  if (existing.filterExtensions === null || options.filterExtensions === null) {
    existing.filterExtensions = null
    return
  }

  for (const extension of options.filterExtensions) {
    existing.filterExtensions.add(extension)
  }
}

function createRepositoryDeclaration(
  input: PrewarmRepositoryInput,
  sparsePaths?: Iterable<string>
): RenounRepositoryDeclaration {
  return {
    input,
    sparsePaths: new Set(sparsePaths),
  }
}

function cloneRepositoryDeclaration(
  declaration: RenounRepositoryDeclaration
): RenounRepositoryDeclaration {
  return createRepositoryDeclaration(
    declaration.input,
    declaration.sparsePaths
  )
}

function resolveRenounRepositoryTarget(
  expression: Expression,
  aliases: RenounAliases,
  references: {
    directories: Map<TsMorphSymbol, RenounDirectoryDeclaration>
    collections: Map<TsMorphSymbol, RenounCollectionDeclaration>
    repositories: Map<TsMorphSymbol, RenounRepositoryDeclaration>
    workspaceDirectory: string
  },
  visiting = new Set<TsMorphSymbol>()
): RenounRepositoryDeclaration | undefined {
  const resolved = resolveReferenceExpression(expression)

  if (Node.isIdentifier(resolved)) {
    const symbol = resolveRenounSymbol(resolved.getSymbol())
    if (!symbol || visiting.has(symbol)) {
      return undefined
    }

    const existing = references.repositories.get(symbol)
    if (existing) {
      return cloneRepositoryDeclaration(existing)
    }

    visiting.add(symbol)

    for (const declaration of symbol.getDeclarations()) {
      if (!Node.isVariableDeclaration(declaration)) {
        continue
      }

      const initializer = declaration.getInitializer()
      if (!initializer) {
        continue
      }

      const repositoryDeclaration = resolveRenounRepositoryTarget(
        initializer,
        aliases,
        references,
        visiting
      )

      if (repositoryDeclaration) {
        references.repositories.set(
          symbol,
          cloneRepositoryDeclaration(repositoryDeclaration)
        )
        return repositoryDeclaration
      }
    }

    return undefined
  }

  if (Node.isNewExpression(resolved)) {
    const repositoryInput = resolveRepositoryInputFromNewExpression(
      resolved,
      aliases
    )
    if (repositoryInput !== undefined) {
      return createRepositoryDeclaration(repositoryInput)
    }
  }

  if (Node.isCallExpression(resolved)) {
    const callExpression = resolved.getExpression()
    if (
      Node.isPropertyAccessExpression(callExpression) &&
      callExpression.getName() === 'getRepository'
    ) {
      const methodTarget = resolveRenounMethodTarget(
        callExpression.getExpression(),
        aliases,
        {
          directories: references.directories,
          collections: references.collections,
          workspaceDirectory: references.workspaceDirectory,
        }
      )

      if (!methodTarget || methodTarget.kind !== 'directory') {
        return undefined
      }

      const repositoryArgument = resolved.getArguments()[0]
      const explicitRepository =
        repositoryArgument && Node.isExpression(repositoryArgument)
          ? resolveRenounRepositoryTarget(
              repositoryArgument,
              aliases,
              references,
              visiting
            )
          : undefined

      const repositoryDeclaration =
        explicitRepository ??
        (methodTarget.declaration.repository
          ? cloneRepositoryDeclaration(methodTarget.declaration.repository)
          : undefined)

      if (!repositoryDeclaration) {
        return undefined
      }

      repositoryDeclaration.sparsePaths.add(methodTarget.declaration.sparsePath)
      return repositoryDeclaration
    }
  }

  const literalRepository = resolveRepositoryInputLiteral(resolved)
  if (literalRepository !== undefined) {
    return createRepositoryDeclaration(literalRepository)
  }

  return undefined
}

function resolveRepositoryInputFromNewExpression(
  newExpression: Expression,
  aliases: RenounAliases
): PrewarmRepositoryInput | undefined {
  const expression = resolveReferenceExpression(newExpression)
  if (!Node.isNewExpression(expression)) {
    return undefined
  }

  if (!isRepositoryConstructorExpression(expression.getExpression(), aliases)) {
    return undefined
  }

  const firstArgument = expression.getArguments()[0]
  if (!firstArgument || !Node.isExpression(firstArgument)) {
    return '.'
  }

  return resolveRepositoryInputLiteral(firstArgument)
}

function resolveRepositoryInputLiteral(
  expression: Expression
): PrewarmRepositoryInput | undefined {
  const value = resolveLiteralExpression(expression)

  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return undefined
}

function resolveDirectoryDeclarationFromNewExpression(
  newExpression: Expression,
  aliases: RenounAliases,
  workspaceDirectory: string,
  repositoryDeclarations: Map<TsMorphSymbol, RenounRepositoryDeclaration>
): RenounDirectoryDeclaration | undefined {
  const expression = resolveReferenceExpression(newExpression)
  if (!Node.isNewExpression(expression)) {
    return undefined
  }

  if (!isDirectoryConstructorExpression(expression.getExpression(), aliases)) {
    return undefined
  }

  const firstArgument = expression.getArguments()[0]
  if (!firstArgument || !Node.isExpression(firstArgument)) {
    return undefined
  }

  const path = resolveDirectoryPathFromLiteral(firstArgument, workspaceDirectory)
  const sparsePath = resolveDirectorySparsePathFromLiteral(firstArgument)

  if (!path || !sparsePath) {
    return undefined
  }

  let repository: RenounRepositoryDeclaration | undefined
  if (Node.isObjectLiteralExpression(firstArgument)) {
    const repositoryProperty = firstArgument.getProperty('repository')
    if (
      repositoryProperty &&
      Node.isPropertyAssignment(repositoryProperty) &&
      Node.isExpression(repositoryProperty.getInitializerOrThrow())
    ) {
      repository = resolveRenounRepositoryTarget(
        repositoryProperty.getInitializerOrThrow(),
        aliases,
        {
          directories: new Map(),
          collections: new Map(),
          repositories: repositoryDeclarations,
          workspaceDirectory,
        }
      )
    }
  }

  return {
    path,
    sparsePath,
    ...(repository ? { repository } : {}),
  }
}

function resolveDirectoryPathFromNewExpression(
  newExpression: Expression,
  aliases: RenounAliases,
  workspaceDirectory: string
): string | undefined {
  return resolveDirectoryDeclarationFromNewExpression(
    newExpression,
    aliases,
    workspaceDirectory,
    new Map()
  )?.path
}

function resolveDirectoryPathFromLiteral(
  expression: Expression,
  workspaceDirectory: string
): string | undefined {
  const pathValue = resolveDirectoryPathValue(expression)
  if (!pathValue) {
    return undefined
  }

  return toAbsoluteDirectoryPath(pathValue, workspaceDirectory)
}

function resolveDirectorySparsePathFromLiteral(
  expression: Expression
): string | undefined {
  const pathValue = resolveDirectoryPathValue(expression)
  if (!pathValue) {
    return undefined
  }

  return toDirectorySparsePath(pathValue)
}

function resolveDirectoryPathValue(expression: Expression): string | undefined {
  const value = resolveLiteralExpression(expression)

  if (
    value &&
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'path' in value &&
    typeof (value as Record<string, unknown>)['path'] === 'string'
  ) {
    return (value as Record<string, unknown>)['path'] as string
  }

  if (typeof value === 'string') {
    return value
  }

  return undefined
}

function toAbsoluteDirectoryPath(
  path: string,
  workspaceDirectory: string
): string {
  const resolvedPath = path.startsWith('workspace:')
    ? resolveSchemePath(path)
    : path

  if (isAbsolute(resolvedPath) || resolvedPath.startsWith('node:')) {
    return resolvedPath
  }

  return resolve(workspaceDirectory, resolvedPath)
}

function toDirectorySparsePath(path: string): string {
  const resolvedPath = path.startsWith('workspace:')
    ? resolveSchemePath(path)
    : path

  if (isAbsolute(resolvedPath) || resolvedPath.startsWith('node:')) {
    return resolvedPath
  }

  return ensureRelativePath(resolvedPath)
}

function isDirectoryConstructorExpression(
  expression: Expression,
  aliases: RenounAliases
): boolean {
  if (Node.isIdentifier(expression)) {
    return aliases.directoryConstructors.has(expression.getText())
  }

  if (Node.isPropertyAccessExpression(expression)) {
    if (expression.getName() !== 'Directory') {
      return false
    }

    const object = expression.getExpression()
    return (
      Node.isIdentifier(object) &&
      aliases.namespaceImports.has(object.getText())
    )
  }

  return false
}

function isCollectionConstructorExpression(
  expression: Expression,
  aliases: RenounAliases
): boolean {
  if (Node.isIdentifier(expression)) {
    return aliases.collectionConstructors.has(expression.getText())
  }

  if (Node.isPropertyAccessExpression(expression)) {
    if (expression.getName() !== 'Collection') {
      return false
    }

    const object = expression.getExpression()
    return (
      Node.isIdentifier(object) &&
      aliases.namespaceImports.has(object.getText())
    )
  }

  return false
}

function isRepositoryConstructorExpression(
  expression: Expression,
  aliases: RenounAliases
): boolean {
  if (Node.isIdentifier(expression)) {
    return aliases.repositoryConstructors.has(expression.getText())
  }

  if (Node.isPropertyAccessExpression(expression)) {
    if (expression.getName() !== 'Repository') {
      return false
    }

    const object = expression.getExpression()
    return (
      Node.isIdentifier(object) &&
      aliases.namespaceImports.has(object.getText())
    )
  }

  return false
}

function resolveExportHistoryOptions(
  callExpression: CallExpression
): Record<string, unknown> | undefined {
  const firstArgument = callExpression.getArguments()[0]
  if (!firstArgument || !Node.isExpression(firstArgument)) {
    return undefined
  }

  const value = resolveLiteralExpression(firstArgument)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
}

function resolveReferenceExpression(expression: Expression): Expression {
  if (Node.isParenthesizedExpression(expression)) {
    return resolveReferenceExpression(expression.getExpression())
  }

  if (Node.isAsExpression(expression) || Node.isTypeAssertion(expression)) {
    return resolveReferenceExpression(expression.getExpression())
  }

  if (Node.isNonNullExpression(expression)) {
    return resolveReferenceExpression(expression.getExpression())
  }

  return expression
}

function shouldSkipSourceFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/')

  return (
    normalizedPath.includes(NODE_MODULES_PATH) || isFilePathGitIgnored(filePath)
  )
}
