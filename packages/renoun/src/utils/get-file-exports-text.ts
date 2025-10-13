import type {
  ImportDeclaration,
  Node,
  Project,
  SourceFile,
  SyntaxKind,
} from 'ts-morph'
import * as tsMorph from 'ts-morph'

import { getPrinter } from '../project/get-printer.js'

interface DeclarationInfo {
  /** The symbol ID of the declaration */
  symbolId: string

  /** The node of the declaration */
  node: Node

  /** Local declarations this depends on */
  dependsOn: Set<string>

  /** Import aliases used by this declaration */
  importsUsed: Set<string>
}

interface ImportInfo {
  /** The local name of the import alias */
  localName: string

  /** The ImportDeclaration node */
  importDeclaration: ImportDeclaration
}

interface FileExport {
  /** The symbol ID of the export */
  name: string

  /** The text of the file export including its dependencies */
  text: string

  /** The position of the export in the file */
  position: number

  /** The kind of the export node */
  kind: SyntaxKind
}

/**
 * Extract all exported declarations in `filePath`,
 * returning an array of { name, text } for each export.
 *
 * - Collects import statements used by those exports
 * - Collects all local dependencies for each export
 * - Strips out everything else
 */
export function getFileExportsText(
  filePath: string,
  project: Project
): Array<FileExport> {
  const printer = getPrinter(project)
  const sourceFile = project.getSourceFileOrThrow(filePath)
  const importMap = getImportInfo(sourceFile)
  const declarationMap = buildDeclarationMap(sourceFile)
  const exportedSymbols = getExportedSymbols(sourceFile, declarationMap)

  for (const declarationInfo of declarationMap.values()) {
    getReferences(declarationInfo, declarationMap, importMap)
  }

  // For each export, do a depth-first search to collect local declarations and used imports
  const results: FileExport[] = []
  for (const exportedSymbolId of exportedSymbols) {
    const usedLocals = findAllLocalDependencies(
      exportedSymbolId,
      declarationMap
    )
    const declaration = declarationMap.get(exportedSymbolId)!
    const position = declaration.node.getPos()
    const kind = declaration.node.getKind()
    const textSnippet = buildTextSnippet(
      usedLocals,
      sourceFile,
      declarationMap,
      printer
    )

    results.push({
      name: exportedSymbolId,
      text: textSnippet,
      position,
      kind,
    })
  }

  return results
}

/**
 * Gather all top-level import declarations in the file, storing a mapping
 * from local alias name -> import declaration node.
 */
function getImportInfo(sourceFile: SourceFile): Map<string, ImportInfo> {
  const importMap = new Map<string, ImportInfo>()
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    // handle default import: `import React from 'react'`
    // e.g. "React" => importDeclaration
    const defaultImport = importDeclaration.getDefaultImport()
    if (defaultImport && defaultImport.getText()) {
      const localName = defaultImport.getText()
      importMap.set(localName, {
        localName,
        importDeclaration: importDeclaration,
      })
    }

    // handle named imports: `import { Image, useHover as hoverMe } from '...'`
    for (const namedBinding of importDeclaration.getNamedImports()) {
      const aliasNode = namedBinding.getNameNode()
      const localName = aliasNode.getText()
      importMap.set(localName, {
        localName,
        importDeclaration: importDeclaration,
      })
      // if there's an alias like "useHover as hoverMe", then `hoverMe` is the local name:
      const aliasIdentifier = namedBinding.getAliasNode()
      if (aliasIdentifier) {
        const actualLocalName = aliasIdentifier.getText()
        importMap.set(actualLocalName, {
          localName: actualLocalName,
          importDeclaration: importDeclaration,
        })
      }
    }

    // handle namespace import: `import * as system from 'system'`
    const namespaceImport = importDeclaration.getNamespaceImport()
    if (namespaceImport) {
      const localName = namespaceImport.getText()
      importMap.set(localName, {
        localName,
        importDeclaration: importDeclaration,
      })
    }
  }

  return importMap
}

/** Build a map of "symbolId" -> DeclarationInfo for each top-level declaration. */
function buildDeclarationMap(
  sourceFile: SourceFile
): Map<string, DeclarationInfo> {
  const map = new Map<string, DeclarationInfo>()

  for (const statement of sourceFile.getStatements()) {
    if (
      tsMorph.Node.isFunctionDeclaration(statement) ||
      tsMorph.Node.isClassDeclaration(statement) ||
      tsMorph.Node.isInterfaceDeclaration(statement) ||
      tsMorph.Node.isTypeAliasDeclaration(statement) ||
      tsMorph.Node.isEnumDeclaration(statement)
    ) {
      const nameNode = statement.getNameNode()
      let symbolId: string | undefined = nameNode?.getText()

      if (!symbolId && isAnonymousDefaultExportStatement(statement)) {
        symbolId = 'default'
      }

      // For named default function/class exports (e.g. `export default function Page() {}`),
      // include both the local name (for dependency/reference resolution) and a synthetic 'default' entry (for export semantics).
      const isNamedDefault =
        !!nameNode &&
        hasModifier(statement, tsMorph.SyntaxKind.DefaultKeyword) &&
        hasModifier(statement, tsMorph.SyntaxKind.ExportKeyword) &&
        (tsMorph.Node.isFunctionDeclaration(statement) ||
          tsMorph.Node.isClassDeclaration(statement))

      if (!symbolId) {
        continue
      }

      map.set(symbolId, {
        symbolId,
        node: statement,
        dependsOn: new Set(),
        importsUsed: new Set(),
      })

      if (isNamedDefault && symbolId !== 'default' && !map.has('default')) {
        map.set('default', {
          symbolId: 'default',
          node: statement,
          dependsOn: new Set(),
          importsUsed: new Set(),
        })
      }
    } else if (
      tsMorph.Node.isExportAssignment(statement) &&
      !statement.isExportEquals()
    ) {
      // export default <expression>
      map.set('default', {
        symbolId: 'default',
        node: statement,
        dependsOn: new Set(),
        importsUsed: new Set(),
      })
    } else if (tsMorph.Node.isVariableStatement(statement)) {
      for (const node of statement.getDeclarationList().getDeclarations()) {
        const nameNode = node.getNameNode()

        if (tsMorph.Node.isIdentifier(nameNode)) {
          const symbolId = nameNode.getText()

          map.set(symbolId, {
            symbolId,
            node,
            dependsOn: new Set(),
            importsUsed: new Set(),
          })
        }
      }
    }
  }

  return map
}

/**
 * Get exported symbol IDs from:
 *  - direct "export" on declarations (e.g. `export function useCounter() {}`)
 *  - export variable statements (e.g. `export const x = 0`)
 *  - export declarations (e.g. `export { Box }`, referencing a local symbol)
 */
function getExportedSymbols(
  sourceFile: SourceFile,
  declarationMap: Map<string, DeclarationInfo>
): Set<string> {
  const exported = new Set<string>()

  for (const statement of sourceFile.getStatements()) {
    // does the statement have an 'export' modifier?
    if (
      tsMorph.Node.isModifierable(statement) &&
      statement
        .getModifiers()
        .some(
          (modifier) => modifier.getKind() === tsMorph.SyntaxKind.ExportKeyword
        )
    ) {
      // if it's a function/class/etc with a name, that name is exported
      if (
        tsMorph.Node.isFunctionDeclaration(statement) ||
        tsMorph.Node.isClassDeclaration(statement) ||
        tsMorph.Node.isInterfaceDeclaration(statement) ||
        tsMorph.Node.isTypeAliasDeclaration(statement) ||
        tsMorph.Node.isEnumDeclaration(statement)
      ) {
        const nameNode = statement.getNameNode()
        let symbolId: string | undefined = nameNode?.getText()
        const isNamedDefault =
          !!nameNode &&
          hasModifier(statement, tsMorph.SyntaxKind.DefaultKeyword) &&
          hasModifier(statement, tsMorph.SyntaxKind.ExportKeyword) &&
          (tsMorph.Node.isFunctionDeclaration(statement) ||
            tsMorph.Node.isClassDeclaration(statement))

        if (isNamedDefault) {
          // Only export the synthetic 'default' symbol; skip the local name
          if (declarationMap.has('default')) {
            exported.add('default')
          }
        } else {
          if (!symbolId && isAnonymousDefaultExportStatement(statement)) {
            symbolId = 'default'
          }
          if (symbolId && declarationMap.has(symbolId)) {
            exported.add(symbolId)
          }
        }
      } else if (
        tsMorph.Node.isExportAssignment(statement) &&
        !statement.isExportEquals()
      ) {
        if (declarationMap.has('default')) {
          exported.add('default')
        }
      }
      // if it's a variable statement (e.g. `export const Box = ...`)
      else if (tsMorph.Node.isVariableStatement(statement)) {
        for (const decl of statement.getDeclarationList().getDeclarations()) {
          const nameNode = decl.getNameNode()
          if (tsMorph.Node.isIdentifier(nameNode)) {
            const symbolId = nameNode.getText()
            if (declarationMap.has(symbolId)) {
              exported.add(symbolId)
            }
          }
        }
      }
    }

    // Handle `export default <expression>` (ExportAssignment) which is not modifierable
    if (
      tsMorph.Node.isExportAssignment(statement) &&
      !statement.isExportEquals()
    ) {
      if (declarationMap.has('default')) {
        exported.add('default')
      }
    }

    // Also handle statements like `export { Button, Card }`
    // This is an ExportDeclaration node that references local symbols.
    if (tsMorph.Node.isExportDeclaration(statement)) {
      const namedExports = statement.getNamedExports()
      for (const expSpec of namedExports) {
        // e.g. `export { SystemButton as Button }`
        const nameNode = expSpec.getNameNode()
        if (!nameNode) continue
        const localName = nameNode.getText()
        if (declarationMap.has(localName)) {
          exported.add(localName)
        }
      }
    }
  }

  return exported
}

/**
 * Gathers references to:
 *  - other top-level declarations in the file
 *  - import aliases used by this declaration
 */
function getReferences(
  declarationInfo: DeclarationInfo,
  declarationMap: Map<string, DeclarationInfo>,
  importMap: Map<string, ImportInfo>
) {
  declarationInfo.node.forEachDescendant((desc) => {
    if (tsMorph.Node.isIdentifier(desc)) {
      const identifierText = desc.getText()

      // If the identifier is a local top-level declaration
      if (
        declarationMap.has(identifierText) &&
        identifierText !== declarationInfo.symbolId
      ) {
        declarationInfo.dependsOn.add(identifierText)
      }
      // If the identifier is an import alias
      else if (importMap.has(identifierText)) {
        declarationInfo.importsUsed.add(identifierText)
      }
    }
  })
}

/** Find all local dependencies for a given root symbol ID using a depth-first search. */
function findAllLocalDependencies(
  rootSymbolId: string,
  declarationMap: Map<string, DeclarationInfo>
): Set<string> {
  const visited = new Set<string>()
  const stack = [rootSymbolId]

  while (stack.length) {
    const current = stack.pop()!
    if (visited.has(current)) continue
    visited.add(current)

    const info = declarationMap.get(current)
    if (!info) continue

    for (const dependency of info.dependsOn) {
      if (!visited.has(dependency)) {
        stack.push(dependency)
      }
    }
  }

  return visited
}

/** Gather all import aliases used by a set of local declarations. */
function getUsedImports(
  usedLocals: Set<string>,
  declarationMap: Map<string, DeclarationInfo>
): Set<string> {
  const usedImportAliases = new Set<string>()
  for (const localId of usedLocals) {
    const info = declarationMap.get(localId)

    if (!info) continue

    for (const alias of info.importsUsed) {
      usedImportAliases.add(alias)
    }
  }
  return usedImportAliases
}

/** Build a text snippet for a file export that includes all lexical dependencies. */
function buildTextSnippet(
  usedLocals: Set<string>,
  sourceFile: SourceFile,
  declarationMap: Map<string, DeclarationInfo>,
  printer: tsMorph.ts.Printer
): string {
  const usedImports = getUsedImports(usedLocals, declarationMap)
  const fileStatements = sourceFile.getStatements()
  const lines: string[] = []

  for (const statement of fileStatements) {
    if (tsMorph.Node.isImportDeclaration(statement)) {
      const importText = printFilteredImportStatement(
        statement,
        usedImports,
        printer
      )
      if (importText) {
        lines.push(importText)
      }
      continue
    }

    // check if it's a top-level declaration we need to keep
    if (
      tsMorph.Node.isFunctionDeclaration(statement) ||
      tsMorph.Node.isClassDeclaration(statement) ||
      tsMorph.Node.isInterfaceDeclaration(statement) ||
      tsMorph.Node.isTypeAliasDeclaration(statement) ||
      tsMorph.Node.isEnumDeclaration(statement)
    ) {
      const nameNode = statement.getNameNode()
      let symbolId: string | undefined = nameNode?.getText()
      if (!symbolId && isAnonymousDefaultExportStatement(statement)) {
        symbolId = 'default'
      }
      // If this is a named default export, we stored an additional 'default' entry; prefer retaining default id for snippet inclusion
      if (
        symbolId &&
        hasModifier(statement, tsMorph.SyntaxKind.DefaultKeyword) &&
        hasModifier(statement, tsMorph.SyntaxKind.ExportKeyword) &&
        usedLocals.has('default')
      ) {
        symbolId = 'default'
      }
      if (symbolId && usedLocals.has(symbolId)) {
        lines.push(stripLeadingJsDoc(statement.getFullText()))
      }
    } else if (
      tsMorph.Node.isExportAssignment(statement) &&
      !statement.isExportEquals() &&
      usedLocals.has('default')
    ) {
      lines.push(stripLeadingJsDoc(statement.getFullText()))
    } else if (tsMorph.Node.isVariableStatement(statement)) {
      const declarations = statement.getDeclarationList().getDeclarations()
      const matched = declarations.some((declaration) => {
        const nameNode = declaration.getNameNode()
        return (
          tsMorph.Node.isIdentifier(nameNode) &&
          usedLocals.has(nameNode.getText())
        )
      })
      if (matched) {
        lines.push(stripLeadingJsDoc(statement.getFullText()))
      }
    }
  }

  return lines.join('').trim()
}

/** Remove leading JSDoc blocks from a statement's full text, leaving inline comments intact. */
function stripLeadingJsDoc(text: string): string {
  return text.replace(/^(\s*)\/\*\*[\s\S]*?\*\/\s*/m, '$1')
}

/** Print a filtered import statement, removing unused imports. */
function printFilteredImportStatement(
  declaration: ImportDeclaration,
  usedAliases: Set<string>,
  printer: tsMorph.ts.Printer
): string | undefined {
  const ts = tsMorph.ts
  const { factory } = ts

  const moduleSpecifier = factory.createStringLiteral(
    declaration.getModuleSpecifierValue()
  )

  const defaultId = declaration.getDefaultImport()?.getText()
  const keepDefault = defaultId && usedAliases.has(defaultId)

  const namespaceId = declaration.getNamespaceImport()?.getText()
  const keepNamespace = namespaceId && usedAliases.has(namespaceId)

  const namedSpecs = declaration
    .getNamedImports()
    .map((namedImport) => ({
      name: namedImport.getNameNode().getText(),
      alias: namedImport.getAliasNode()?.getText(),
      isTypeOnly: namedImport.isTypeOnly(),
    }))
    .filter(({ name, alias }) => usedAliases.has(alias ?? name))
    .map(({ name, alias, isTypeOnly }) =>
      factory.createImportSpecifier(
        isTypeOnly,
        alias ? factory.createIdentifier(name) : undefined,
        factory.createIdentifier(alias ?? name)
      )
    )

  if (!keepDefault && !keepNamespace && namedSpecs.length === 0) {
    return undefined
  }

  const importClause = factory.createImportClause(
    declaration.isTypeOnly(),
    keepDefault ? factory.createIdentifier(defaultId!) : undefined,
    keepNamespace
      ? factory.createNamespaceImport(factory.createIdentifier(namespaceId!))
      : namedSpecs.length
        ? factory.createNamedImports(namedSpecs)
        : undefined
  )

  const importDeclaration = factory.createImportDeclaration(
    undefined,
    importClause,
    moduleSpecifier
  )

  return printer.printNode(
    ts.EmitHint.Unspecified,
    importDeclaration,
    declaration.getSourceFile().compilerNode
  )
}

/** Determine if a node has a specific modifier kind. */
function hasModifier(
  node: tsMorph.Node & { getModifiers?: () => tsMorph.Node[] },
  kind: tsMorph.SyntaxKind
) {
  return node.getModifiers?.()?.some((modifier) => modifier.getKind() === kind)
}

/** Returns true if this is an anonymous default export (no name, export + default modifiers). */
function isAnonymousDefaultExportStatement(
  statement: tsMorph.Node & {
    getModifiers?: () => tsMorph.Node[]
    getNameNode?: () => tsMorph.Node | undefined
  }
) {
  // Must be function or class declarations for our current anonymous support.
  if (
    !(
      tsMorph.Node.isFunctionDeclaration(statement) ||
      tsMorph.Node.isClassDeclaration(statement)
    )
  ) {
    return false
  }
  const hasName = Boolean(statement.getNameNode?.())
  if (hasName) return false
  return (
    hasModifier(statement, tsMorph.SyntaxKind.DefaultKeyword) &&
    hasModifier(statement, tsMorph.SyntaxKind.ExportKeyword)
  )
}
