import { createHash } from 'node:crypto'
import { ts } from 'ts-morph'

import { normalizePath } from '../utils/path.ts'

/** Separator used in export IDs (format: "path/to/file.ts::exportName") */
export const EXPORT_ID_SEPARATOR = '::'

/** Maximum file size for AST parsing (1MB) */
export const MAX_PARSE_BYTES = 1024 * 1024

/** Extension priority for module resolution */
export const EXTENSION_PRIORITY = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.json',
]

/** Index file candidates for module resolution */
export const INDEX_FILE_CANDIDATES = [
  'index.ts',
  'index.tsx',
  'index.js',
  'index.jsx',
  'index.mjs',
]

/** Minimum Dice similarity for signature-based rename detection */
export const RENAME_SIGNATURE_DICE_MIN = 0.9

/** Lower threshold for renamed files */
export const RENAME_SIGNATURE_DICE_MIN_RENAMED_FILE = 0.7

/** Margin required between best and second-best candidates */
export const RENAME_SIGNATURE_DICE_MARGIN = 0.05

/** Minimum Dice similarity for path-based rename detection */
export const RENAME_PATH_DICE_MIN = 0.6

/**
 * Represents an export item from a module.
 * The ID is the unique identifier for the export across the codebase.
 */
export interface ExportItem {
  /** The exported name of the symbol */
  name: string

  /** The source name (for re-exports like `export { x as y }`) */
  sourceName?: string

  /** The ID of the export (format: "path/to/file::ExportName" or special markers) */
  id: string

  /** SHA-1 hash of the AST node text (for update detection) */
  bodyHash: string

  /** SHA-1 hash of the export signature (for update detection) */
  signatureHash: string

  /** The signature text (for similarity comparison) */
  signatureText: string

  /** The starting line number of the export (1-based) */
  startLine?: number

  /** The ending line number of the export (1-based) */
  endLine?: number

  /** Whether the export is deprecated */
  deprecated?: true

  /** The deprecation message */
  deprecatedMessage?: string
}

interface DeprecatedInfo {
  deprecated: true
  deprecatedMessage?: string
}

/** Shared TypeScript printer instance */
let sharedTsPrinter: ts.Printer | null = null

/** Get the shared TypeScript printer for consistent output */
export function getSharedTsPrinter(): ts.Printer {
  if (!sharedTsPrinter) {
    sharedTsPrinter = ts.createPrinter({ removeComments: true })
  }
  return sharedTsPrinter
}

/**
 * Parse an export ID into its file and name components.
 * @param id The export ID (format: "path/to/file.ts::exportName")
 * @returns The parsed file and name, or null if invalid
 */
export function parseExportId(
  id: string
): { file: string; name: string } | null {
  const idx = id.indexOf(EXPORT_ID_SEPARATOR)
  if (idx === -1) {
    return null
  }
  return {
    file: id.slice(0, idx),
    name: id.slice(idx + EXPORT_ID_SEPARATOR.length),
  }
}

/**
 * Format an export ID from file path and export name.
 * @param file The file path
 * @param name The export name
 * @returns The formatted export ID
 */
export function formatExportId(file: string, name: string): string {
  return `${file}${EXPORT_ID_SEPARATOR}${name}`
}

/**
 * Get the cache key for export parsing.
 * @param sha The blob SHA
 * @returns The cache key
 */
export function getExportParseCacheKey(sha: string): string {
  return sha
}

/**
 * Get the TypeScript script kind for a file path.
 * @param fileName The file name
 * @returns The TypeScript script kind
 */
export function getScriptKindForPath(fileName: string): ts.ScriptKind {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.tsx')) {
    return ts.ScriptKind.TSX
  }
  if (
    lower.endsWith('.ts') ||
    lower.endsWith('.mts') ||
    lower.endsWith('.cts')
  ) {
    return ts.ScriptKind.TS
  }
  if (lower.endsWith('.jsx')) {
    return ts.ScriptKind.JSX
  }
  if (
    lower.endsWith('.js') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs')
  ) {
    return ts.ScriptKind.JS
  }
  if (lower.endsWith('.json')) {
    return ts.ScriptKind.JSON
  }
  return ts.ScriptKind.Unknown
}

/**
 * Get the canonical surface (signature) of a TypeScript node.
 * This extracts the public API signature without implementation details.
 */
export function getCanonicalSurface(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  printer: ts.Printer
): string {
  if (ts.isFunctionDeclaration(node)) {
    const signatureNode = ts.factory.updateFunctionDeclaration(
      node,
      node.modifiers,
      node.asteriskToken,
      node.name,
      node.typeParameters,
      node.parameters,
      node.type,
      undefined
    )
    return printer.printNode(ts.EmitHint.Unspecified, signatureNode, sourceFile)
  }

  if (ts.isMethodDeclaration(node)) {
    const signatureNode = ts.factory.updateMethodDeclaration(
      node,
      node.modifiers,
      node.asteriskToken,
      node.name,
      node.questionToken,
      node.typeParameters,
      node.parameters,
      node.type,
      undefined
    )
    return printer.printNode(ts.EmitHint.Unspecified, signatureNode, sourceFile)
  }

  if (ts.isConstructorDeclaration(node)) {
    const signatureNode = ts.factory.updateConstructorDeclaration(
      node,
      node.modifiers,
      node.parameters,
      undefined
    )
    return printer.printNode(ts.EmitHint.Unspecified, signatureNode, sourceFile)
  }

  if (ts.isClassDeclaration(node)) {
    const members = node.members.map((member) => {
      if (ts.isMethodDeclaration(member)) {
        return ts.factory.updateMethodDeclaration(
          member,
          member.modifiers,
          member.asteriskToken,
          member.name,
          member.questionToken,
          member.typeParameters,
          member.parameters,
          member.type,
          undefined
        )
      }
      if (ts.isConstructorDeclaration(member)) {
        return ts.factory.updateConstructorDeclaration(
          member,
          member.modifiers,
          member.parameters,
          undefined
        )
      }
      if (ts.isPropertyDeclaration(member)) {
        return ts.factory.updatePropertyDeclaration(
          member,
          member.modifiers,
          member.name,
          member.questionToken ?? member.exclamationToken,
          member.type,
          undefined
        )
      }
      return member
    })
    const signatureNode = ts.factory.updateClassDeclaration(
      node,
      node.modifiers,
      node.name,
      node.typeParameters,
      node.heritageClauses,
      members
    )
    return printer.printNode(ts.EmitHint.Unspecified, signatureNode, sourceFile)
  }

  if (ts.isVariableDeclaration(node)) {
    const signatureNode = ts.factory.updateVariableDeclaration(
      node,
      node.name,
      node.exclamationToken,
      node.type,
      undefined
    )
    return printer.printNode(ts.EmitHint.Unspecified, signatureNode, sourceFile)
  }

  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile)
}

/**
 * Recursively extracts the text representation of an EntityName or JSDocMemberName
 */
function getEntityNameText(name: ts.EntityName | ts.JSDocMemberName): string {
  if (ts.isIdentifier(name)) {
    return name.escapedText as string
  }
  if (ts.isQualifiedName(name)) {
    return `${getEntityNameText(name.left)}.${name.right.escapedText as string}`
  }
  // JSDocMemberName: left#right
  if ('left' in name && 'right' in name) {
    const left = getEntityNameText(
      name.left as ts.EntityName | ts.JSDocMemberName
    )
    const right = (name.right as ts.Identifier).escapedText as string
    return `${left}#${right}`
  }
  return ''
}

/**
 * Extract comment text from JSDoc comments.
 */
function getJSDocCommentText(
  comment: string | ts.NodeArray<ts.JSDocComment> | undefined
): string | undefined {
  if (!comment) return undefined
  if (typeof comment === 'string') return comment.trim()
  return comment
    .map((node) => {
      if ('text' in node && typeof node.text === 'string') {
        return node.text
      }
      if (
        ts.isJSDocLink(node) ||
        ts.isJSDocLinkCode(node) ||
        ts.isJSDocLinkPlain(node)
      ) {
        const linkText = node.text ?? ''
        if (node.name) {
          const nameText = getEntityNameText(node.name)
          return nameText + (linkText ? ' ' + linkText : '')
        }
        return linkText
      }
      return ''
    })
    .join('')
    .trim()
}

/**
 * Get deprecation info from a TypeScript node.
 */
export function getDeprecatedInfo(
  node: ts.Node,
  sourceFile?: ts.SourceFile
): DeprecatedInfo | null {
  // Check JSDoc tags first (standard @deprecated)
  const tags = ts.getJSDocTags(node)
  const jsDoc = (node as ts.Node & { jsDoc?: ts.JSDoc[] }).jsDoc
  const rawTags =
    tags.length > 0
      ? tags
      : (jsDoc?.flatMap((doc: ts.JSDoc) => doc.tags ?? []) ?? [])
  for (const tag of rawTags) {
    if (tag.tagName?.text === 'deprecated') {
      const comment = getJSDocCommentText(tag.comment)
      return comment
        ? { deprecated: true, deprecatedMessage: comment }
        : { deprecated: true }
    }
  }

  // Check for leading comment containing "@deprecated" (common pattern)
  if (sourceFile) {
    const fullText = sourceFile.getFullText()
    const pos = node.getFullStart()
    const end = node.getStart(sourceFile)
    const leadingText = fullText.slice(pos, end)

    // Match @deprecated in block or line comments
    const deprecatedMatch = leadingText.match(
      /(?:\/\*\*[\s\S]*?@deprecated\s*([^\n*]*)[\s\S]*?\*\/|\/\/\s*@deprecated\s*(.*))/
    )
    if (deprecatedMatch) {
      const message = (deprecatedMatch[1] ?? deprecatedMatch[2])?.trim()
      return message
        ? { deprecated: true, deprecatedMessage: message }
        : { deprecated: true }
    }

    // Check for trailing comment on the same line (e.g., `export const foo = 1 // @deprecated`)
    const nodeEnd = node.getEnd()
    const lineEnd = fullText.indexOf('\n', nodeEnd)
    const trailingText = fullText.slice(
      nodeEnd,
      lineEnd === -1 ? undefined : lineEnd
    )
    const trailingMatch = trailingText.match(/\/\/\s*@deprecated[,:]?\s*(.*)/)
    if (trailingMatch) {
      const message = trailingMatch[1]?.trim()
      return message
        ? { deprecated: true, deprecatedMessage: message }
        : { deprecated: true }
    }
  }

  return null
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.canHaveModifiers(node)
    ? ts.getModifiers(node)
    : undefined
  return modifiers?.some((modifier) => modifier.kind === kind) ?? false
}

/**
 * Check if a node has the export modifier.
 */
export function hasExportModifier(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword)
}

/**
 * Check if a node has the default modifier.
 */
export function hasDefaultModifier(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.DefaultKeyword)
}

/**
 * Get binding identifiers from a binding pattern.
 */
export function getBindingIdentifiers(node: ts.BindingName): string[] {
  const variables: string[] = []
  if (ts.isIdentifier(node)) {
    variables.push(node.text)
  } else if (ts.isObjectBindingPattern(node)) {
    node.elements.forEach((element) => {
      variables.push(...getBindingIdentifiers(element.name))
    })
  } else if (ts.isArrayBindingPattern(node)) {
    node.elements.forEach((element) => {
      if (!ts.isOmittedExpression(element)) {
        variables.push(...getBindingIdentifiers(element.name))
      }
    })
  }
  return variables
}

/**
 * Scan exports from a file using the TypeScript AST.
 * Returns a map of export name to ExportItem.
 */
export function scanModuleExports(
  fileName: string,
  content: string
): Map<string, ExportItem> {
  const exports = new Map<string, ExportItem>()

  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    false, // setParentNodes: false is faster
    getScriptKindForPath(fileName)
  )

  const printer = getSharedTsPrinter()
  const declarationDeprecations = new Map<string, DeprecatedInfo>()

  function getLineNumbers(node: ts.Node) {
    const startPos = node.getStart(sourceFile)
    const endPos = node.getEnd()
    const startLine =
      sourceFile.getLineAndCharacterOfPosition(startPos).line + 1 // 1-based
    const endLine = sourceFile.getLineAndCharacterOfPosition(endPos).line + 1 // 1-based
    return { startLine, endLine }
  }

  function getHashes(node: ts.Node) {
    const fullText = node.getText(sourceFile).replace(/\s+/g, ' ')
    const bodyHash = createHash('sha1')
      .update(fullText)
      .digest('hex')
      .substring(0, 8)

    const signatureText = getCanonicalSurface(node, sourceFile, printer)
    const surfaceText = signatureText.replace(/\s+/g, ' ')
    const signatureHash = createHash('sha1')
      .update(surfaceText)
      .digest('hex')
      .substring(0, 8)

    return { bodyHash, signatureHash, signatureText }
  }

  function getHashesAndLines(node: ts.Node) {
    return { ...getHashes(node), ...getLineNumbers(node) }
  }

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isVariableStatement(node)) {
      const statementInfo = getDeprecatedInfo(node, sourceFile)
      node.declarationList.declarations.forEach((declaration) => {
        const declarationInfo =
          getDeprecatedInfo(declaration, sourceFile) ?? statementInfo
        if (!declarationInfo) {
          return
        }
        if (ts.isIdentifier(declaration.name)) {
          declarationDeprecations.set(declaration.name.text, declarationInfo)
        } else if (
          ts.isObjectBindingPattern(declaration.name) ||
          ts.isArrayBindingPattern(declaration.name)
        ) {
          const boundVariables = getBindingIdentifiers(declaration.name)
          boundVariables.forEach((name) => {
            declarationDeprecations.set(name, declarationInfo)
          })
        }
      })
      return
    }

    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      const info = getDeprecatedInfo(node, sourceFile)
      if (info && node.name && ts.isIdentifier(node.name)) {
        declarationDeprecations.set(node.name.text, info)
      }
    }
  })

  ts.forEachChild(sourceFile, (node) => {
    // Export Declaration: export { x } from 'y'; export * from 'z';
    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const fromModule = node.moduleSpecifier.text

        if (node.exportClause) {
          // export { a, b as c } from '...'
          if (ts.isNamedExports(node.exportClause)) {
            node.exportClause.elements.forEach((element) => {
              const exportedName = element.name.text
              const sourceName = element.propertyName?.text ?? exportedName
              exports.set(exportedName, {
                name: exportedName,
                sourceName,
                id: `__FROM__${fromModule}`,
                ...getHashesAndLines(element),
              })
            })
          } else if (ts.isNamespaceExport(node.exportClause)) {
            const exportedName = node.exportClause.name.text
            exports.set(exportedName, {
              name: exportedName,
              id: `__NAMESPACE__${fromModule}`,
              ...getHashesAndLines(node),
            })
          }
        } else {
          // export * from '...'
          exports.set(`__STAR__${fromModule}`, {
            name: '*',
            id: `__STAR__${fromModule}`,
            ...getHashesAndLines(node),
          })
        }
      } else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        // export { x }; (Local export)
        node.exportClause.elements.forEach((element) => {
          const deprecatedInfo = declarationDeprecations.get(element.name.text)
          exports.set(element.name.text, {
            name: element.name.text,
            id: '__LOCAL__',
            ...getHashesAndLines(element),
            ...(deprecatedInfo ?? {}),
          })
        })
      }
      return
    }

    // Variable Statement: export const x = 1;
    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      const statementInfo = getDeprecatedInfo(node, sourceFile)
      // Use the statement's lines for variable declarations
      const statementLines = getLineNumbers(node)
      node.declarationList.declarations.forEach((declaration) => {
        const deprecatedInfo =
          getDeprecatedInfo(declaration, sourceFile) ??
          statementInfo ??
          (ts.isIdentifier(declaration.name)
            ? declarationDeprecations.get(declaration.name.text)
            : null)
        if (ts.isIdentifier(declaration.name)) {
          exports.set(declaration.name.text, {
            name: declaration.name.text,
            id: '__LOCAL__',
            ...getHashes(declaration),
            ...statementLines,
            ...(deprecatedInfo ?? {}),
          })
        } else if (
          ts.isObjectBindingPattern(declaration.name) ||
          ts.isArrayBindingPattern(declaration.name)
        ) {
          const boundVariables = getBindingIdentifiers(declaration.name)
          boundVariables.forEach((name) => {
            exports.set(name, {
              name,
              id: '__LOCAL__',
              ...getHashes(declaration),
              ...statementLines,
              ...(deprecatedInfo ?? declarationDeprecations.get(name) ?? {}),
            })
          })
        }
      })
      return
    }

    // Functions/Classes/Types/Interfaces
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      hasExportModifier(node)
    ) {
      const deprecatedInfo =
        getDeprecatedInfo(node, sourceFile) ??
        (node.name && ts.isIdentifier(node.name)
          ? declarationDeprecations.get(node.name.text)
          : null)
      if (node.name && ts.isIdentifier(node.name)) {
        exports.set(node.name.text, {
          name: node.name.text,
          id: '__LOCAL__',
          ...getHashesAndLines(node),
          ...(deprecatedInfo ?? {}),
        })
      }
      const isDefault = hasDefaultModifier(node)
      if (isDefault) {
        exports.set('default', {
          name: 'default',
          id: '__LOCAL__',
          ...getHashesAndLines(node),
          ...(deprecatedInfo ?? {}),
        })
      }
      return
    }

    // Export Assignment: export = x;
    if (ts.isExportAssignment(node)) {
      const deprecatedInfo = getDeprecatedInfo(node, sourceFile)
      exports.set('default', {
        name: 'default',
        id: '__LOCAL__',
        ...getHashesAndLines(node),
        ...(deprecatedInfo ?? {}),
      })
    }
  })

  return exports
}

/**
 * Creates bigrams (e.g. "function" -> "fu", "un", "nc", "ct"...)
 */
function getBigrams(string: string): Set<string> {
  const bigrams = new Set<string>()
  for (let index = 0; index < string.length - 1; index++) {
    bigrams.add(string.slice(index, index + 2))
  }
  return bigrams
}

/**
 * Calculates string similarity using Dice Coefficient on bigrams.
 */
export function getDiceSimilarity(str1: string, str2: string): number {
  if (str1 === str2) {
    return 1.0
  }

  if (str1.length < 2 || str2.length < 2) {
    return 0.0
  }

  // Fail fast if lengths are too different
  const lengthDiff = Math.abs(str1.length - str2.length)
  const maxLength = Math.max(str1.length, str2.length)
  if (lengthDiff / maxLength > 0.5) {
    return 0.0
  }

  const str1Bigrams = getBigrams(str1)
  const str2Bigrams = getBigrams(str2)

  // intersection / total size
  let intersection = 0
  for (const bigram of str1Bigrams) {
    if (str2Bigrams.has(bigram)) {
      intersection++
    }
  }

  return (2 * intersection) / (str1Bigrams.size + str2Bigrams.size)
}

/**
 * Check if a file path is under a scope directory.
 */
export function isUnderScope(file: string, scope: string | string[]): boolean {
  if (Array.isArray(scope)) {
    return scope.some((scopePath) => isUnderScope(file, scopePath))
  }
  const normalizedFile = normalizePath(file)
  const normalizedScope = normalizePath(scope)
  if (!normalizedScope || normalizedScope === '.') {
    return true
  }
  return (
    normalizedFile === normalizedScope ||
    normalizedFile.startsWith(normalizedScope + '/')
  )
}

/**
 * Maps items with a concurrency limit, starting new work as slots free up.
 */
export async function mapWithLimit<Type, Result>(
  items: Type[],
  limit: number,
  fn: (item: Type) => Promise<Result>
): Promise<Result[]> {
  const results: Result[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await fn(items[index])
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker()
  )
  await Promise.all(workers)
  return results
}

/** LRU Map implementation. */
export class LRUMap<Key, Value> extends Map<Key, Value> {
  #maxSize: number

  constructor(maxSize: number) {
    super()
    this.#maxSize = maxSize
  }

  get(key: Key): Value | undefined {
    const value = super.get(key)
    if (value !== undefined) {
      super.delete(key)
      super.set(key, value)
    }
    return value
  }

  set(key: Key, value: Value): this {
    if (super.has(key)) {
      super.delete(key)
    }
    super.set(key, value)
    if (super.size > this.#maxSize) {
      const oldest = super.keys().next().value
      if (oldest !== undefined) {
        super.delete(oldest)
      }
    }
    return this
  }
}

/**
 * Check if a path looks like a file path (has an extension).
 */
export function looksLikeFilePath(path: string): boolean {
  const lastSegment = path.split('/').pop() || ''
  return lastSegment.includes('.')
}

/** Base change record with commit information. */
export interface ChangeBase {
  sha: string
  unix: number
  date: string
  release?: string
}

/** Maps for comparing exports between commits. */
export interface ExportComparisonMaps {
  previousById: Map<string, ExportItem>
  currentById: Map<string, ExportItem>
  previousNamesById: Map<string, Set<string>>
}

/** Build maps for comparing exports between two commit states. */
export function buildExportComparisonMaps(
  previousExports: Map<string, Map<string, ExportItem>>,
  currentExports: Map<string, Map<string, ExportItem>>
): ExportComparisonMaps {
  const previousById = new Map<string, ExportItem>()
  const previousNamesById = new Map<string, Set<string>>()

  for (const [prevName, prevItems] of previousExports) {
    for (const [id, item] of prevItems) {
      if (!previousById.has(id)) {
        previousById.set(id, item)
      }
      let names = previousNamesById.get(id)
      if (!names) {
        names = new Set()
        previousNamesById.set(id, names)
      }
      names.add(prevName)
    }
  }

  const currentById = new Map<string, ExportItem>()
  for (const items of currentExports.values()) {
    for (const [id, item] of items) {
      if (!currentById.has(id)) {
        currentById.set(id, item)
      }
    }
  }

  return { previousById, currentById, previousNamesById }
}

/**
 * Rename pair detected between exports.
 */
export interface RenamePair {
  addedId: string
  oldId: string
  score: number
}

/**
 * Detect same-file renames by comparing signature similarity.
 * Returns a map of new ID -> { oldId } for detected renames.
 */
export function detectSameFileRenames(
  previousById: Map<string, ExportItem>,
  currentById: Map<string, ExportItem>,
  removedIds: string[],
  thresholdDice: number = RENAME_SIGNATURE_DICE_MIN
): {
  renamePairs: Map<string, { oldId: string }>
  usedRemovedIds: Set<string>
} {
  const renamePairs = new Map<string, { oldId: string }>()
  const usedRemovedIds = new Set<string>()

  // Group added and removed by file
  const byFileAdded = new Map<string, string[]>()
  const byFileRemoved = new Map<string, string[]>()

  for (const id of currentById.keys()) {
    if (previousById.has(id)) continue
    const parsed = parseExportId(id)
    if (!parsed) continue
    const list = byFileAdded.get(parsed.file)
    if (list) {
      list.push(id)
    } else {
      byFileAdded.set(parsed.file, [id])
    }
  }

  for (const removedId of removedIds) {
    if (usedRemovedIds.has(removedId)) continue
    const parsed = parseExportId(removedId)
    if (!parsed) continue
    const list = byFileRemoved.get(parsed.file)
    if (list) {
      list.push(removedId)
    } else {
      byFileRemoved.set(parsed.file, [removedId])
    }
  }

  // Find rename candidates within each file
  for (const [file, addedIds] of byFileAdded) {
    const removedInFile = byFileRemoved.get(file)
    if (!removedInFile || removedInFile.length === 0) continue

    interface Candidate {
      addedId: string
      removedId: string
      score: number
    }
    const candidates: Candidate[] = []

    for (const addedId of addedIds) {
      const addedItem = currentById.get(addedId)
      if (!addedItem) continue

      for (const removedId of removedInFile) {
        if (usedRemovedIds.has(removedId)) continue
        const removedItem = previousById.get(removedId)
        if (!removedItem) continue

        // Exact signature match
        if (removedItem.signatureHash === addedItem.signatureHash) {
          candidates.push({ addedId, removedId, score: 1 })
          continue
        }

        // Dice similarity match
        if (addedItem.signatureText && removedItem.signatureText) {
          const score = getDiceSimilarity(
            addedItem.signatureText,
            removedItem.signatureText
          )
          if (score >= thresholdDice) {
            candidates.push({ addedId, removedId, score })
          }
        }
      }
    }

    if (candidates.length === 0) continue

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score)
    const usedAdded = new Set<string>()

    // Greedy matching
    for (const candidate of candidates) {
      if (usedAdded.has(candidate.addedId)) continue
      if (usedRemovedIds.has(candidate.removedId)) continue

      renamePairs.set(candidate.addedId, { oldId: candidate.removedId })
      usedAdded.add(candidate.addedId)
      usedRemovedIds.add(candidate.removedId)
    }
  }

  return { renamePairs, usedRemovedIds }
}

/**
 * Merge rename history from old ID to new ID in the exports record.
 * When both histories exist, they are concatenated (old first, then new).
 */
export function mergeRenameHistory<T>(
  exports: Record<string, T[]>,
  newId: string,
  oldId: string
): T[] {
  let history = exports[newId]
  if (!history) {
    history = []
    exports[newId] = history
  }

  if (exports[oldId] && oldId !== newId) {
    const oldHistory = exports[oldId]
    if (oldHistory) {
      if (history.length === 0) {
        // New history is empty, just use old history
        history = oldHistory
        exports[newId] = history
      } else if (oldHistory !== history) {
        // Both exist and are different, concatenate them
        history = [...oldHistory, ...history]
        exports[newId] = history
      }
      delete exports[oldId]
    }
  }

  return history
}

/**
 * Detect cross-file renames by matching body+signature hashes.
 * Uses path similarity for tie-breaking when multiple candidates exist.
 */
export function detectCrossFileRenames(
  previousById: Map<string, ExportItem>,
  currentById: Map<string, ExportItem>,
  removedIds: string[],
  usedRemovedIds: Set<string>,
  renamePairs: Map<string, { oldId: string }>,
  pathDiceMin: number = RENAME_PATH_DICE_MIN,
  marginThreshold: number = RENAME_SIGNATURE_DICE_MARGIN
): void {
  // Group removed exports by hash
  const removedByHash = new Map<string, string[]>()
  for (const removedId of removedIds) {
    if (usedRemovedIds.has(removedId)) continue
    const removedItem = previousById.get(removedId)
    if (!removedItem) continue
    const key = `${removedItem.bodyHash}|${removedItem.signatureHash}`
    const list = removedByHash.get(key)
    if (list) {
      list.push(removedId)
    } else {
      removedByHash.set(key, [removedId])
    }
  }

  // Match current exports to removed exports by hash
  for (const [id, currentItem] of currentById) {
    if (previousById.has(id)) continue
    if (renamePairs.has(id)) continue

    const key = `${currentItem.bodyHash}|${currentItem.signatureHash}`
    const candidates = removedByHash.get(key)
    if (!candidates || candidates.length === 0) continue

    let chosen: string | null = null

    if (candidates.length === 1) {
      // Only one candidate, use it if not already used
      if (!usedRemovedIds.has(candidates[0])) {
        chosen = candidates[0]
      }
    } else {
      // Multiple candidates, use path similarity for tie-breaking
      const parsedCurrent = parseExportId(id)
      if (!parsedCurrent) continue

      let best = { removedId: '', score: -1 }
      let second = { removedId: '', score: -1 }

      for (const removedId of candidates) {
        if (usedRemovedIds.has(removedId)) continue
        const parsedRemoved = parseExportId(removedId)
        if (!parsedRemoved) continue

        const score = getDiceSimilarity(parsedCurrent.file, parsedRemoved.file)
        if (score > best.score) {
          second = best
          best = { removedId, score }
        } else if (score > second.score) {
          second = { removedId, score }
        }
      }

      // Only choose if path similarity is high enough and margin is sufficient
      if (
        best.score >= pathDiceMin &&
        best.score - second.score >= marginThreshold
      ) {
        chosen = best.removedId
      }
    }

    if (chosen && !usedRemovedIds.has(chosen)) {
      renamePairs.set(id, { oldId: chosen })
      usedRemovedIds.add(chosen)
    }
  }
}

/**
 * Check if an oscillation should be collapsed (Added followed by Removed or vice versa
 * within the same release).
 * Returns true if the oscillation was collapsed (last entry was removed from history).
 */
export function checkAndCollapseOscillation<
  T extends { kind: string; release?: string },
>(
  history: T[],
  changeKind: 'Added' | 'Removed',
  changeRelease: string | undefined
): boolean {
  if (history.length === 0) return false
  if (changeRelease === undefined) return false

  const lastEntry = history[history.length - 1]
  const oppositeKind = changeKind === 'Added' ? 'Removed' : 'Added'

  if (lastEntry.kind === oppositeKind && lastEntry.release === changeRelease) {
    // Collapse the oscillation by removing the last entry
    history.pop()
    return true
  }

  return false
}
