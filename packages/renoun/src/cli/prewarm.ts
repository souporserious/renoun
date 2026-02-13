import { Semaphore } from '../utils/Semaphore.ts'
import { getDebugLogger } from '../utils/debug.ts'
import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.ts'
import { getProject } from '../project/get-project.ts'
import { getFileExports } from '../project/client.ts'
import type { ProjectOptions } from '../project/types.ts'
import { isJavaScriptLikeExtension } from '../utils/is-javascript-like-extension.ts'
import { Directory, File } from '../file-system/entries.tsx'
import { getTsMorph } from '../utils/ts-morph.ts'
import { resolveLiteralExpression } from '../utils/resolve-expressions.ts'
import type {
  Expression,
  Project,
  SourceFile,
  Symbol as TsMorphSymbol,
} from '../utils/ts-morph.ts'

const { Node, ts } = getTsMorph()

const PREWARM_FILE_EXPORT_CONCURRENCY = 8
const NODE_MODULES_PATH = '/node_modules/'

interface RenounDirectoryAliases {
  constructors: Set<string>
  namespaces: Set<string>
}

/**
 * Start warming the in-process RPC server cache for known `Directory#getEntries`
 * call sites.
 */
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
  const directoryPaths = collectDirectoryPaths(project)

  if (directoryPaths.size === 0) {
    logger.debug('No `Directory#getEntries` callsites were found to prewarm')
    return
  }

  const filePaths = await collectDirectoryFilePaths(directoryPaths)

  if (filePaths.size === 0) {
    logger.debug('No prewarmed files were discovered in discovered directories')
    return
  }

  logger.debug('Prewarming Renoun RPC cache', () => ({
    data: {
      directories: directoryPaths.size,
      files: filePaths.size,
    },
  }))

  await warmFileExportCache(Array.from(filePaths))
}

function collectDirectoryPaths(project: Project): Set<string> {
  const directoryPaths = new Set<string>()

  for (const sourceFile of project.getSourceFiles()) {
    const sourceFilePath = sourceFile.getFilePath()
    if (shouldSkipSourceFile(sourceFilePath)) {
      continue
    }

    const aliases = getRenounDirectoryAliases(sourceFile)
    if (aliases.constructors.size === 0 && aliases.namespaces.size === 0) {
      continue
    }

    const discoveredPaths = collectDirectoryPathsFromSourceFile(sourceFile, aliases)
    discoveredPaths.forEach((directoryPath) => {
      directoryPaths.add(directoryPath)
    })
  }

  return directoryPaths
}

function collectDirectoryPathsFromSourceFile(
  sourceFile: SourceFile,
  aliases: RenounDirectoryAliases
): Set<string> {
  const directoryPaths = new Set<string>()
  const directoryInstances = new Map<TsMorphSymbol, string>()

  for (const variableDeclaration of sourceFile.getDescendantsOfKind(
    ts.SyntaxKind.VariableDeclaration
  )) {
    const initializer = variableDeclaration.getInitializer()
    const directoryPath = resolveDirectoryPathFromNewExpression(
      initializer,
      aliases
    )

    if (directoryPath === undefined) {
      continue
    }

    const variableName = variableDeclaration.getNameNode()
    if (!Node.isIdentifier(variableName)) {
      continue
    }

    const symbol = variableName.getSymbol()
    if (symbol === undefined) {
      continue
    }

    directoryInstances.set(symbol, directoryPath)
  }

  for (const callExpression of sourceFile.getDescendantsOfKind(
    ts.SyntaxKind.CallExpression
  )) {
    const expression = callExpression.getExpression()

    if (!Node.isPropertyAccessExpression(expression)) {
      continue
    }

    if (expression.getName() !== 'getEntries') {
      continue
    }

    const target = expression.getExpression()
    const directoryPath = resolveDirectoryPathFromExpression(
      target,
      aliases,
      directoryInstances
    )

    if (directoryPath !== undefined) {
      directoryPaths.add(directoryPath)
    }
  }

  return directoryPaths
}

function getRenounDirectoryAliases(
  sourceFile: SourceFile
): RenounDirectoryAliases {
  const aliases: RenounDirectoryAliases = {
    constructors: new Set<string>(),
    namespaces: new Set<string>(),
  }

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    if (importDeclaration.getModuleSpecifierValue() !== 'renoun') {
      continue
    }

    if (importDeclaration.isTypeOnly()) {
      continue
    }

    for (const namedImport of importDeclaration.getNamedImports()) {
      if (namedImport.getName() !== 'Directory') {
        continue
      }

      const alias = namedImport.getAliasNode()
      aliases.constructors.add(alias ? alias.getText() : namedImport.getName())
    }

    const namespaceImport = importDeclaration.getNamespaceImport()
    if (namespaceImport) {
      aliases.namespaces.add(namespaceImport.getText())
    }
  }

  return aliases
}

function resolveDirectoryPathFromExpression(
  expression: Expression,
  aliases: RenounDirectoryAliases,
  directoryInstances: Map<TsMorphSymbol, string>
): string | undefined {
  const resolvedExpression = resolveReferenceExpression(expression)

  if (Node.isIdentifier(resolvedExpression)) {
    const symbol = resolvedExpression.getSymbol()

    if (symbol) {
      return directoryInstances.get(symbol)
    }

    return undefined
  }

  if (Node.isNewExpression(resolvedExpression)) {
    return resolveDirectoryPathFromNewExpression(
      resolvedExpression,
      aliases
    )
  }

  return undefined
}

function resolveDirectoryPathFromNewExpression(
  newExpression: Expression | undefined,
  aliases: RenounDirectoryAliases
): string | undefined {
  if (!Node.isNewExpression(newExpression)) {
    return undefined
  }

  const expression = newExpression.getExpression()
  if (!isDirectoryConstructorExpression(expression, aliases)) {
    return undefined
  }

  const firstArgument = newExpression.getArguments()[0]
  if (!firstArgument) {
    return '.'
  }

  return resolveDirectoryPathFromLiteral(firstArgument)
}

function resolveDirectoryPathFromLiteral(expression: Expression): string | undefined {
  const value = resolveLiteralExpression(expression)

  if (typeof value === 'string') {
    return value
  }

  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value['path'] === 'string'
  ) {
    return value['path']
  }

  return undefined
}

function isDirectoryConstructorExpression(
  expression: Expression,
  aliases: RenounDirectoryAliases
): boolean {
  if (Node.isIdentifier(expression)) {
    return aliases.constructors.has(expression.getText())
  }

  if (Node.isPropertyAccessExpression(expression)) {
    if (expression.getName() !== 'Directory') {
      return false
    }

    const object = expression.getExpression()
    return Node.isIdentifier(object) && aliases.namespaces.has(object.getText())
  }

  return false
}

function collectDirectoryFilePaths(
  directoryPaths: Set<string>
): Promise<Set<string>> {
  const filePaths = new Set<string>()

  return Promise.all(
    Array.from(directoryPaths.values()).map(async (directoryPath) => {
      const directory = new Directory({ path: directoryPath })
      const entries = await directory.getEntries({
        recursive: true,
        includeDirectoryNamedFiles: true,
        includeIndexAndReadmeFiles: true,
      })

      for (const entry of entries) {
        if (!(entry instanceof File)) {
          continue
        }

        if (isFilePathGitIgnored(entry.absolutePath)) {
          continue
        }

        const extension = entry.extension
        if (extension !== undefined && isJavaScriptLikeExtension(extension)) {
          filePaths.add(entry.absolutePath)
        }
      }
    })
  ).then(() => filePaths)
}

function shouldSkipSourceFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/')

  return (
    isFilePathGitIgnored(filePath) ||
    normalizedPath.includes(NODE_MODULES_PATH)
  )
}

async function warmFileExportCache(filePaths: string[]): Promise<void> {
  const logger = getDebugLogger()
  const concurrency = Math.min(PREWARM_FILE_EXPORT_CONCURRENCY, filePaths.length)
  const gate = new Semaphore(Math.max(1, concurrency))

  await Promise.all(
    filePaths.map(async (filePath) => {
      const release = await gate.acquire()

      try {
        await getFileExports(filePath)
      } finally {
        release()
      }
    })
  )

  logger.debug('Finished prewarming Renoun RPC cache')
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
