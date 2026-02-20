import { dirname, isAbsolute, resolve } from 'node:path'
import { getDebugLogger } from '../utils/debug.ts'
import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.ts'
import { getProject } from '../project/get-project.ts'
import type { ProjectOptions } from '../project/types.ts'
import {
  CacheStore,
  type CacheStoreComputeContext,
  type CacheStoreConstDependency,
} from '../file-system/Cache.ts'
import { getCacheStorePersistence } from '../file-system/CacheSqlite.ts'
import type { FileSystem } from '../file-system/FileSystem.ts'
import {
  createPersistentCacheNodeKey,
  normalizeCachePath,
} from '../file-system/cache-key.ts'
import { FileSystemSnapshot } from '../file-system/Snapshot.ts'
import { hasJavaScriptLikeExtension } from '../utils/is-javascript-like-extension.ts'
import { resolveSchemePath } from '../utils/path.ts'
import {
  resolveLiteralExpression,
  type LiteralExpressionValue,
} from '../utils/resolve-expressions.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import { getTsMorph } from '../utils/ts-morph.ts'
import { warmRenounPrewarmTargets } from './prewarm/warm-analysis.ts'
import type {
  Expression,
  CallExpression,
  Project,
  SourceFile,
  Symbol as TsMorphSymbol,
} from '../utils/ts-morph.ts'

const { Node } = getTsMorph()

const PREWARM_COLLECTION_YIELD_INTERVAL = 128
const NODE_MODULES_PATH = '/node_modules/'
const PREWARM_WORKSPACE_GATE_SCOPE = 'prewarm-workspace-gate'
const PREWARM_WORKSPACE_GATE_VERSION = '1'
const PREWARM_WORKSPACE_GATE_VERSION_DEP = 'prewarm-workspace-gate-version'
const PREWARM_WORKSPACE_TOKEN_DEP = 'prewarm-workspace-token'

interface PrewarmWorkspaceGateRuntimeFileSystem {
  getAbsolutePath(path: string): string
  getWorkspaceChangeToken?(rootPath: string): Promise<string | null>
}

interface PrewarmWorkspaceGateStore {
  store: CacheStore
}

interface PrewarmWorkspaceGate {
  store: CacheStore
  nodeKey: string
  constDeps: CacheStoreConstDependency[]
  workspaceToken: string
  workspaceRootPath: string
}

let prewarmWorkspaceGateStoreByKey:
  | Map<string, PrewarmWorkspaceGateStore>
  | undefined

interface RenounAliases {
  directoryConstructors: Set<string>
  collectionConstructors: Set<string>
  namespaceImports: Set<string>
}

interface RenounDirectoryDeclaration {
  path: string
}

interface RenounCollectionDeclaration {
  entries: RenounCollectionEntryReference[]
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

type RenounMethodTarget =
  | {
      kind: 'directory'
      path: string
    }
  | {
      kind: 'collection'
      symbol: TsMorphSymbol
    }

export interface RenounPrewarmTargets {
  directoryGetEntries: DirectoryEntriesRequest[]
  fileGetFile: FileRequest[]
}

type PendingRenounCallsite = {
  callExpression: CallExpression
  methodName: 'getEntries' | 'getFile'
  aliases: RenounAliases
}

/**
 * Collect `Directory`/`Collection` callsites for prewarming from the provided project.
 */
export async function collectRenounPrewarmTargets(
  project: Project,
  projectOptions?: ProjectOptions
): Promise<RenounPrewarmTargets> {
  const directoryDeclarations = new Map<TsMorphSymbol, RenounDirectoryDeclaration>()
  const collectionRawEntries = new Map<TsMorphSymbol, Expression[]>()
  const collectionAliases = new Map<TsMorphSymbol, RenounAliases>()
  const collectionDeclarations = new Map<TsMorphSymbol, RenounCollectionDeclaration>()

  const getEntriesRequests = new Map<string, DirectoryEntriesRequest>()
  const getFileRequests: FileRequest[] = []
  const pendingCallsites: PendingRenounCallsite[] = []
  const collectionGetEntriesRequests = new Map<
    TsMorphSymbol,
    Omit<DirectoryEntriesRequest, 'directoryPath'>
  >()

  const projectDirectory = projectOptions?.tsConfigFilePath
    ? dirname(projectOptions.tsConfigFilePath)
    : process.cwd()
  const sourceFiles = project.getSourceFiles()

  for (const [index, sourceFile] of sourceFiles.entries()) {
    if (index > 0 && index % PREWARM_COLLECTION_YIELD_INTERVAL === 0) {
      await new Promise((resolve) => setImmediate(resolve))
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
      projectDirectory,
      directoryDeclarations,
      collectionRawEntries,
      collectionAliases,
      pendingCallsites
    )
  }

  for (const [collectionSymbol, rawEntries] of collectionRawEntries.entries()) {
    const aliases = collectionAliases.get(collectionSymbol) ?? EMPTY_RENOUN_ALIASES

    const resolvedEntries = rawEntries
      .map((entryExpression) =>
        resolveCollectionEntryReference(
          entryExpression,
          {
            directories: directoryDeclarations,
            collections: collectionDeclarations,
            projectDirectory,
            aliases,
          }
        )
      )
      .filter((entry): entry is RenounCollectionEntryReference =>
        entry !== undefined
      )

    collectionDeclarations.set(collectionSymbol, {
      entries: resolvedEntries,
    })
  }

  for (const { callExpression, methodName, aliases } of pendingCallsites) {
    const callExpressionTarget = callExpression.getExpression()
    if (!Node.isPropertyAccessExpression(callExpressionTarget)) {
      continue
    }

    const methodTarget = resolveRenounMethodTarget(
      callExpressionTarget.getExpression(),
      aliases,
      {
        directories: directoryDeclarations,
        collections: collectionDeclarations,
        projectDirectory,
      }
    )

    if (!methodTarget) {
      continue
    }

    if (methodName === 'getEntries') {
      const options = resolveDirectoryGetEntriesOptions(callExpression)

      if (methodTarget.kind === 'directory') {
        addDirectoryEntriesRequest(getEntriesRequests, {
          directoryPath: methodTarget.path,
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
  }
}

const EMPTY_RENOUN_ALIASES: RenounAliases = {
  directoryConstructors: new Set(),
  collectionConstructors: new Set(),
  namespaceImports: new Set(),
}

function getRenounAliases(sourceFile: SourceFile): RenounAliases {
  const aliases: RenounAliases = {
    directoryConstructors: new Set<string>(),
    collectionConstructors: new Set<string>(),
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
  projectDirectory: string,
  directoryDeclarations: Map<TsMorphSymbol, RenounDirectoryDeclaration>,
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

      if (Node.isNewExpression(referenceExpression)) {
        const symbol = node.getSymbol()
        if (!symbol) {
          return
        }

        if (
          isDirectoryConstructorExpression(referenceExpression.getExpression(), aliases)
        ) {
          const path = resolveDirectoryPathFromNewExpression(
            referenceExpression,
            aliases,
            projectDirectory
          )

          if (path !== undefined) {
            directoryDeclarations.set(symbol, { path })
            return
          }
        }

        if (
          isCollectionConstructorExpression(
            referenceExpression.getExpression(),
            aliases
          )
        ) {
          const entries = resolveCollectionEntriesFromNewExpression(
            referenceExpression
          )

          collectionRawEntries.set(symbol, entries)
          collectionAliases.set(symbol, aliases)
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
    if (methodName !== 'getEntries' && methodName !== 'getFile') {
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
    sourceText.includes('getEntries') ||
    sourceText.includes('getFile')
  )
}

function resolveCollectionEntriesFromNewExpression(newExpression: Expression): Expression[] {
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
    projectDirectory: string
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
      references.projectDirectory
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
    projectDirectory: string
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
        path: directoryDeclaration.path,
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
    const directoryPath = resolveDirectoryPathFromNewExpression(
      resolved,
      aliases,
      references.projectDirectory
    )

    if (directoryPath) {
      return {
        kind: 'directory',
        path: directoryPath,
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
  const directoryPath = methodTarget.path

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

function resolveDirectoryGetEntriesOptions(
  callExpression: CallExpression
): {
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

function parseFilterExtensions(filterValue: string | undefined): Set<string> | null {
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

function resolveDirectoryPathFromNewExpression(
  newExpression: Expression,
  aliases: RenounAliases,
  projectDirectory: string
): string | undefined {
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

  return resolveDirectoryPathFromLiteral(
    firstArgument,
    projectDirectory
  )
}

function resolveDirectoryPathFromLiteral(
  expression: Expression,
  projectDirectory: string
): string | undefined {
  const value = resolveLiteralExpression(expression)

  if (
    value &&
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'path' in value &&
    typeof (value as Record<string, unknown>)['path'] === 'string'
  ) {
    return toAbsoluteDirectoryPath(
      (value as Record<string, unknown>)['path'] as string,
      projectDirectory
    )
  }

  if (typeof value === 'string') {
    return toAbsoluteDirectoryPath(value, projectDirectory)
  }

  return undefined
}

function toAbsoluteDirectoryPath(path: string, projectDirectory: string): string {
  const resolvedPath = path.startsWith('workspace:')
    ? resolveSchemePath(path)
    : path

  if (isAbsolute(resolvedPath) || resolvedPath.startsWith('node:')) {
    return resolvedPath
  }

  return resolve(projectDirectory, resolvedPath)
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
    normalizedPath.includes(NODE_MODULES_PATH) ||
    isFilePathGitIgnored(filePath)
  )
}

function recordConstDependencies(
  context: CacheStoreComputeContext,
  constDeps: readonly CacheStoreConstDependency[]
): void {
  for (const constDependency of constDeps) {
    context.recordConstDep(constDependency.name, constDependency.version)
  }
}

function getProjectRootFromWorkspaceRoot(
  workspaceRootPath: string
): string | undefined {
  try {
    return getRootDirectory(workspaceRootPath)
  } catch {
    return undefined
  }
}

function getPrewarmWorkspaceGateStore(
  gateKey: string,
  fileSystem: FileSystem & PrewarmWorkspaceGateRuntimeFileSystem,
  workspaceRootPath: string
): CacheStore {
  if (!prewarmWorkspaceGateStoreByKey) {
    prewarmWorkspaceGateStoreByKey = new Map<string, PrewarmWorkspaceGateStore>()
  }

  const existing = prewarmWorkspaceGateStoreByKey.get(gateKey)
  if (existing) {
    return existing.store
  }

  const snapshot = new FileSystemSnapshot(fileSystem)
  const projectRoot = getProjectRootFromWorkspaceRoot(workspaceRootPath)
  const persistence = projectRoot
    ? getCacheStorePersistence({ projectRoot })
    : getCacheStorePersistence()
  const store = new CacheStore({
    snapshot,
    persistence,
  })

  prewarmWorkspaceGateStoreByKey.set(gateKey, { store })

  return store
}

async function resolvePrewarmWorkspaceGate(
  projectOptions?: ProjectOptions
): Promise<PrewarmWorkspaceGate | undefined> {
  try {
    const { NodeFileSystem } = await import('../file-system/NodeFileSystem.ts')
    const fileSystem = new NodeFileSystem({
      tsConfigPath: projectOptions?.tsConfigFilePath,
    }) as FileSystem & PrewarmWorkspaceGateRuntimeFileSystem
    const getWorkspaceChangeToken = fileSystem.getWorkspaceChangeToken
    if (typeof getWorkspaceChangeToken !== 'function') {
      return undefined
    }

    const workspaceRootPath = fileSystem.getAbsolutePath(
      projectOptions?.tsConfigFilePath
        ? dirname(projectOptions.tsConfigFilePath)
        : process.cwd()
    )
    const workspaceToken =
      (await getWorkspaceChangeToken.call(fileSystem, workspaceRootPath)) ?? null
    if (!workspaceToken) {
      return undefined
    }

    const normalizedWorkspaceRootPath = normalizeCachePath(workspaceRootPath)
    const normalizedTsConfigPath =
      typeof projectOptions?.tsConfigFilePath === 'string'
        ? normalizeCachePath(projectOptions.tsConfigFilePath)
        : null
    const gateKey = `${normalizedWorkspaceRootPath}::${normalizedTsConfigPath ?? 'none'}`
    const store = getPrewarmWorkspaceGateStore(
      gateKey,
      fileSystem,
      workspaceRootPath
    )
    const nodeKey = createPersistentCacheNodeKey({
      domain: PREWARM_WORKSPACE_GATE_SCOPE,
      domainVersion: PREWARM_WORKSPACE_GATE_VERSION,
      namespace: 'run',
      payload: {
        workspaceRootPath: normalizedWorkspaceRootPath,
        tsConfigFilePath: normalizedTsConfigPath,
      },
    })
    const constDeps: CacheStoreConstDependency[] = [
      {
        name: PREWARM_WORKSPACE_GATE_VERSION_DEP,
        version: PREWARM_WORKSPACE_GATE_VERSION,
      },
      {
        name: PREWARM_WORKSPACE_TOKEN_DEP,
        version: workspaceToken,
      },
    ]

    return {
      store,
      nodeKey,
      constDeps,
      workspaceToken,
      workspaceRootPath,
    }
  } catch {
    return undefined
  }
}

async function runPrewarmAnalysis(options?: {
  projectOptions?: ProjectOptions
}): Promise<'no-targets' | 'warmed'> {
  const logger = getDebugLogger()
  const project = getProject(options?.projectOptions)
  const targets = await collectRenounPrewarmTargets(
    project,
    options?.projectOptions
  )

  if (
    targets.directoryGetEntries.length === 0 &&
    targets.fileGetFile.length === 0
  ) {
    logger.debug('No renoun prewarm targets were found')
    return 'no-targets'
  }

  await warmRenounPrewarmTargets(targets, {
    projectOptions: options?.projectOptions,
    isFilePathGitIgnored,
  })

  return 'warmed'
}

export async function prewarmRenounRpcServerCache(options?: {
  projectOptions?: ProjectOptions
}): Promise<void> {
  const logger = getDebugLogger()

  if (
    process.env.RENOUN_SERVER_PORT === undefined ||
    process.env.RENOUN_SERVER_ID === undefined
  ) {
    return
  }

  const workspaceGate = await resolvePrewarmWorkspaceGate(options?.projectOptions)
  if (!workspaceGate) {
    await runPrewarmAnalysis(options)
    return
  }

  let didExecutePrewarm = false
  await workspaceGate.store.getOrCompute(
    workspaceGate.nodeKey,
    {
      persist: true,
      constDeps: workspaceGate.constDeps,
    },
    async (context) => {
      didExecutePrewarm = true
      recordConstDependencies(context, workspaceGate.constDeps)
      const result = await runPrewarmAnalysis(options)
      return {
        result,
        workspaceRootPath: workspaceGate.workspaceRootPath,
        workspaceToken: workspaceGate.workspaceToken,
        updatedAt: Date.now(),
      }
    }
  )

  if (!didExecutePrewarm) {
    logger.debug('Skipping renoun prewarm because workspace token is unchanged', () => ({
      data: {
        workspaceRootPath: workspaceGate.workspaceRootPath,
      },
    }))
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
        options.filterExtensions === null ? null : new Set(options.filterExtensions),
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
