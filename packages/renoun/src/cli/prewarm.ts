import { dirname, isAbsolute, resolve } from 'node:path'
import { Semaphore } from '../utils/Semaphore.ts'
import { getDebugLogger } from '../utils/debug.ts'
import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.ts'
import { getProject } from '../project/get-project.ts'
import type { ProjectOptions } from '../project/types.ts'
import { Directory, File } from '../file-system/entries.tsx'
import { isJavaScriptLikeExtension } from '../utils/is-javascript-like-extension.ts'
import {
  resolveLiteralExpression,
  type LiteralExpressionValue,
} from '../utils/resolve-expressions.ts'
import { getTsMorph } from '../utils/ts-morph.ts'
import type {
  Expression,
  CallExpression,
  Project,
  SourceFile,
  Symbol as TsMorphSymbol,
} from '../utils/ts-morph.ts'

const { Node, ts } = getTsMorph()

const PREWARM_FILE_CACHE_CONCURRENCY = 8
const NODE_MODULES_PATH = '/node_modules/'

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

interface DirectoryEntriesRequest {
  directoryPath: string
  recursive: boolean
  includeDirectoryNamedFiles: boolean
  includeIndexAndReadmeFiles: boolean
  filterExtensions: Set<string> | null
}

interface FileRequest {
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

type WarmFileMethod = 'getExports' | 'getSections' | 'getContent'
type WarmFileOptionalMethods = {
  getExports?: () => Promise<unknown>
  getSections?: () => Promise<unknown>
  getContent?: () => Promise<unknown>
}

interface WarmFileTask {
  absolutePath: string
  file: File & WarmFileOptionalMethods
  methods: Set<WarmFileMethod>
}

export interface RenounPrewarmTargets {
  directoryGetEntries: DirectoryEntriesRequest[]
  fileGetFile: FileRequest[]
}

/**
 * Collect `Directory`/`Collection` callsites for prewarming from the provided project.
 */
export function collectRenounPrewarmTargets(
  project: Project,
  projectOptions?: ProjectOptions
): RenounPrewarmTargets {
  const directoryDeclarations = new Map<TsMorphSymbol, RenounDirectoryDeclaration>()
  const collectionRawEntries = new Map<TsMorphSymbol, Expression[]>()
  const collectionSourceFiles = new Map<TsMorphSymbol, SourceFile>()
  const collectionDeclarations = new Map<TsMorphSymbol, RenounCollectionDeclaration>()

  const getEntriesRequests = new Map<string, DirectoryEntriesRequest>()
  const getFileRequests: FileRequest[] = []

  const collectionGetEntriesCalls: Array<{
    collectionSymbol: TsMorphSymbol
    options: Omit<DirectoryEntriesRequest, 'directoryPath'>
  }> = []

  const projectDirectory = projectOptions?.tsConfigFilePath
    ? dirname(projectOptions.tsConfigFilePath)
    : process.cwd()

  for (const sourceFile of project.getSourceFiles()) {
    const sourceFilePath = sourceFile.getFilePath()
    if (shouldSkipSourceFile(sourceFilePath)) {
      continue
    }

    const aliases = getRenounAliases(sourceFile)
    if (
      aliases.directoryConstructors.size === 0 &&
      aliases.collectionConstructors.size === 0 &&
      aliases.namespaceImports.size === 0
    ) {
      continue
    }

    collectRenounDeclarations(
      sourceFile,
      aliases,
      projectDirectory,
      directoryDeclarations,
      collectionRawEntries,
      collectionSourceFiles
    )
  }

  for (const [collectionSymbol, rawEntries] of collectionRawEntries.entries()) {
    const sourceFile = collectionSourceFiles.get(collectionSymbol)
    const aliases = sourceFile
      ? getRenounAliases(sourceFile)
      : EMPTY_RENOUN_ALIASES

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

  for (const sourceFile of project.getSourceFiles()) {
    const sourceFilePath = sourceFile.getFilePath()
    if (shouldSkipSourceFile(sourceFilePath)) {
      continue
    }

    const aliases = getRenounAliases(sourceFile)
    for (const callExpression of sourceFile.getDescendantsOfKind(
      ts.SyntaxKind.CallExpression
    )) {
      const expression = callExpression.getExpression()
      if (!Node.isPropertyAccessExpression(expression)) {
        continue
      }

      const methodName = expression.getName()
      if (methodName !== 'getEntries' && methodName !== 'getFile') {
        continue
      }

      const methodTarget = resolveRenounMethodTarget(
        expression.getExpression(),
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

        collectionGetEntriesCalls.push({
          collectionSymbol: methodTarget.symbol,
          options: {
            recursive: options.recursive,
            includeDirectoryNamedFiles: options.includeDirectoryNamedFiles,
            includeIndexAndReadmeFiles: options.includeIndexAndReadmeFiles,
            filterExtensions: options.filterExtensions,
          },
        })
        continue
      }

      const fileRequest = resolveGetFileCall(
        callExpression,
        methodTarget
      )

      if (fileRequest !== undefined) {
        getFileRequests.push(fileRequest)
      }
    }
  }

  for (const collectionCall of collectionGetEntriesCalls) {
    expandCollectionEntries(
      collectionCall.collectionSymbol,
      collectionCall.options,
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
    if (importDeclaration.getModuleSpecifierValue() !== 'renoun') {
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

function collectRenounDeclarations(
  sourceFile: SourceFile,
  aliases: RenounAliases,
  projectDirectory: string,
  directoryDeclarations: Map<TsMorphSymbol, RenounDirectoryDeclaration>,
  collectionRawEntries: Map<TsMorphSymbol, Expression[]>,
  collectionSourceFiles: Map<TsMorphSymbol, SourceFile>
): void {
  for (const variableDeclaration of sourceFile.getDescendantsOfKind(
    ts.SyntaxKind.VariableDeclaration
  )) {
    const initializer = variableDeclaration.getInitializer()
    if (!initializer) {
      continue
    }

    const symbol = variableDeclaration.getSymbol()
    if (!symbol) {
      continue
    }

    const referenceExpression = resolveReferenceExpression(initializer)

    if (Node.isNewExpression(referenceExpression)) {
      if (isDirectoryConstructorExpression(referenceExpression.getExpression(), aliases)) {
        const path = resolveDirectoryPathFromNewExpression(
          referenceExpression,
          aliases,
          projectDirectory
        )

        if (path !== undefined) {
          directoryDeclarations.set(symbol, { path })
          continue
        }
      }

      if (isCollectionConstructorExpression(referenceExpression.getExpression(), aliases)) {
        const entries = resolveCollectionEntriesFromNewExpression(
          referenceExpression
        )

        collectionRawEntries.set(symbol, entries)
        collectionSourceFiles.set(symbol, sourceFile)
      }
    }
  }
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
  if (isAbsolute(path) || path.startsWith('node:')) {
    return path
  }

  return resolve(projectDirectory, path)
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
    isFilePathGitIgnored(filePath) ||
    normalizedPath.includes(NODE_MODULES_PATH)
  )
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

  const project = getProject(options?.projectOptions)
  const targets = collectRenounPrewarmTargets(project, options?.projectOptions)

  if (
    targets.directoryGetEntries.length === 0 &&
    targets.fileGetFile.length === 0
  ) {
    logger.debug('No renoun prewarm targets were found')
    return
  }

  const warmFilesByPath = new Map<string, WarmFileTask>()

  if (targets.directoryGetEntries.length > 0) {
    logger.debug('Collecting files from Directory#getEntries callsites', () => ({
      data: {
        directories: targets.directoryGetEntries.length,
      },
    }))

    await collectWarmFilesFromDirectoryTargets(
      targets.directoryGetEntries,
      warmFilesByPath
    )
  }

  if (targets.fileGetFile.length > 0) {
    logger.debug('Collecting files from Directory#getFile callsites', () => ({
      data: {
        files: targets.fileGetFile.length,
      },
    }))

    await collectWarmFilesFromGetFileTargets(targets.fileGetFile, warmFilesByPath)
  }

  if (warmFilesByPath.size === 0) {
    logger.debug('No prewarm files were discovered')
    return
  }

  logger.debug('Prewarming renoun file cache', () => ({
    data: {
      files: warmFilesByPath.size,
    },
  }))

  await warmFiles(Array.from(warmFilesByPath.values()))

  logger.debug('Finished prewarming Renoun file cache')
}

async function collectWarmFilesFromDirectoryTargets(
  directoryTargets: DirectoryEntriesRequest[],
  warmFilesByPath: Map<string, WarmFileTask>
): Promise<void> {
  const gate = new Semaphore(PREWARM_FILE_CACHE_CONCURRENCY)

  await Promise.all(
    directoryTargets.map(async (request) => {
      const release = await gate.acquire()
      try {
        const directory = new Directory({ path: request.directoryPath })
        const entries = await directory.getEntries({
          recursive: request.recursive,
          includeDirectoryNamedFiles: request.includeDirectoryNamedFiles,
          includeIndexAndReadmeFiles: request.includeIndexAndReadmeFiles,
        })

        for (const entry of entries) {
          if (!(entry instanceof File)) {
            continue
          }

          if (isFilePathGitIgnored(entry.absolutePath)) {
            continue
          }

          if (entry.extension === undefined) {
            continue
          }

          if (
            request.filterExtensions !== null &&
            !request.filterExtensions.has(entry.extension)
          ) {
            continue
          }

          const methods = determineWarmMethods(entry.extension)
          if (methods.size === 0) {
            continue
          }

          mergeWarmTask(
            {
              absolutePath: entry.absolutePath,
              file: entry,
              methods,
            },
            warmFilesByPath
          )
        }
      } finally {
        release()
      }
    })
  )
}

async function collectWarmFilesFromGetFileTargets(
  getFileTargets: FileRequest[],
  warmFilesByPath: Map<string, WarmFileTask>
): Promise<void> {
  const gate = new Semaphore(PREWARM_FILE_CACHE_CONCURRENCY)

  await Promise.all(
    getFileTargets.map(async (request) => {
      const release = await gate.acquire()
      try {
        const directory = new Directory({ path: request.directoryPath })
        const file = await directory.getFile(request.path, request.extensions)

        if (isFilePathGitIgnored(file.absolutePath)) {
          return
        }

        if (file.extension === undefined) {
          return
        }

        const methods = determineWarmMethods(file.extension)
        if (methods.size === 0) {
          return
        }

        mergeWarmTask(
          {
            absolutePath: file.absolutePath,
            file,
            methods,
          },
          warmFilesByPath
        )
      } finally {
        release()
      }
    })
  )
}

function determineWarmMethods(extension: string): Set<WarmFileMethod> {
  const methods = new Set<WarmFileMethod>()

  if (isJavaScriptLikeExtension(extension)) {
    methods.add('getExports')
    methods.add('getSections')
    return methods
  }

  if (extension === 'mdx' || extension === 'md') {
    methods.add('getSections')
    methods.add('getContent')
    return methods
  }

  return methods
}

function mergeWarmTask(
  task: WarmFileTask,
  warmFilesByPath: Map<string, WarmFileTask>
): void {
  const existing = warmFilesByPath.get(task.absolutePath)

  if (!existing) {
    warmFilesByPath.set(task.absolutePath, task)
    return
  }

  for (const method of task.methods) {
    existing.methods.add(method)
  }
}

async function warmFiles(warmFiles: WarmFileTask[]): Promise<void> {
  const gate = new Semaphore(PREWARM_FILE_CACHE_CONCURRENCY)

  await Promise.all(
    warmFiles.map(async (warmFile) => {
      const release = await gate.acquire()
      try {
        if (warmFile.methods.has('getExports') && warmFile.file.getExports) {
          await warmFile.file.getExports()
        }

        if (warmFile.methods.has('getSections') && warmFile.file.getSections) {
          await warmFile.file.getSections()
        }

        if (warmFile.methods.has('getContent') && warmFile.file.getContent) {
          await warmFile.file.getContent()
        }
      } finally {
        release()
      }
    })
  )
}
