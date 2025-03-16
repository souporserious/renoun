import type {
  ImportDeclaration,
  Node,
  Project,
  SourceFile,
  SyntaxKind,
} from 'ts-morph'
import * as tsMorph from 'ts-morph'

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
    const textSnippet = buildTextSnippet(
      usedLocals,
      sourceFile,
      declarationMap,
      importMap
    )
    const declaration = declarationMap.get(exportedSymbolId)!

    results.push({
      name: exportedSymbolId,
      text: textSnippet,
      position: declaration.node.getStart(),
      kind: declaration.node.getKind(),
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
      if (!nameNode) continue
      const symbolId = nameNode.getText()

      map.set(symbolId, {
        symbolId,
        node: statement,
        dependsOn: new Set(),
        importsUsed: new Set(),
      })
    } else if (tsMorph.Node.isVariableStatement(statement)) {
      for (const decl of statement.getDeclarationList().getDeclarations()) {
        const nameNode = decl.getNameNode()

        if (tsMorph.Node.isIdentifier(nameNode)) {
          const symbolId = nameNode.getText()

          map.set(symbolId, {
            symbolId,
            node: statement, // the entire "export const x = 0, y = 0"
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
        if (nameNode) {
          const symbolId = nameNode.getText()
          if (declarationMap.has(symbolId)) {
            exported.add(symbolId)
          }
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
      // TODO: handle other cases like `export default function Page() {}`
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
  importMap: Map<string, ImportInfo>
): string {
  const usedImports = getUsedImports(usedLocals, declarationMap)
  const fileStatements = sourceFile.getStatements()
  const lines: string[] = []

  // For each import, prune out unused aliases.
  for (const statement of fileStatements) {
    if (tsMorph.Node.isImportDeclaration(statement)) {
      const prunedImport = pruneImportDeclaration(statement, usedImports)
      if (prunedImport) {
        lines.push(prunedImport)
      }
    }
  }

  // keep local declarations in original order if they are in usedLocals
  for (const statement of fileStatements) {
    // check if it's a top-level declaration we need to keep
    if (
      tsMorph.Node.isFunctionDeclaration(statement) ||
      tsMorph.Node.isClassDeclaration(statement) ||
      tsMorph.Node.isInterfaceDeclaration(statement) ||
      tsMorph.Node.isTypeAliasDeclaration(statement) ||
      tsMorph.Node.isEnumDeclaration(statement)
    ) {
      const nameNode = statement.getNameNode()

      if (!nameNode) {
        continue
      }

      const symbolId = nameNode.getText()

      if (usedLocals.has(symbolId)) {
        stripJsDocs(statement)
        lines.push(statement.getFullText())
      }
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
        stripJsDocs(statement)
        lines.push(statement.getFullText())
      }
    }
  }

  return lines.join('').trim()
}

/**
 * Prune unused parts from an ImportDeclaration.
 *
 * - If the default import is used, keep it.
 * - If the namespace import is used, keep it.
 * - For named imports, filter the list to only those that are used.
 *
 * Returns a new import statement string or an empty string if nothing is used.
 */
function pruneImportDeclaration(
  importDeclaration: ImportDeclaration,
  usedImports: Set<string>
): string {
  // Check default import (e.g. `import React from 'react'`)
  const defaultImport = importDeclaration.getDefaultImport()
  const defaultImportText =
    defaultImport && usedImports.has(defaultImport.getText())
      ? defaultImport.getText()
      : null

  // Check namespace import (e.g. `import * as system from 'system'`)
  const namespaceImport = importDeclaration.getNamespaceImport()
  const namespaceImportText =
    namespaceImport && usedImports.has(namespaceImport.getText())
      ? `* as ${namespaceImport.getText()}`
      : null

  // Check named imports (e.g. `import { Image, useHover as hoverMe } from '...'`)
  const namedImports = importDeclaration.getNamedImports()
  const usedNamedImports: string[] = []

  for (const namedImport of namedImports) {
    const aliasNode = namedImport.getAliasNode()
    const nameNode = namedImport.getNameNode()
    const localName = aliasNode ? aliasNode.getText() : nameNode.getText()
    if (usedImports.has(localName)) {
      // If there's an alias and it differs from the original name, include "original as alias"
      if (aliasNode && aliasNode.getText() !== nameNode.getText()) {
        usedNamedImports.push(`${nameNode.getText()} as ${aliasNode.getText()}`)
      } else {
        usedNamedImports.push(nameNode.getText())
      }
    }
  }

  // Build the import clause.
  let importClause = ''
  if (defaultImportText) {
    importClause = defaultImportText
  }

  if (namespaceImportText) {
    // If both a default and a namespace import exist, separate with a comma.
    importClause = importClause
      ? `${importClause}, ${namespaceImportText}`
      : namespaceImportText
  } else if (usedNamedImports.length > 0) {
    const namedImportsClause = `{ ${usedNamedImports.join(', ')} }`
    importClause = importClause
      ? `${importClause}, ${namedImportsClause}`
      : namedImportsClause
  }

  // If nothing was used, return an empty string
  if (!importClause) {
    return ''
  }

  const moduleSpecifier = importDeclaration.getModuleSpecifier().getText()
  const endsWithSemicolon =
    importDeclaration.getLastToken().getKind() ===
    tsMorph.SyntaxKind.SemicolonToken

  return `import ${importClause} from ${moduleSpecifier}${endsWithSemicolon ? ';' : ''}`
}

/** Strip JSDoc from a statement. */
function stripJsDocs(statement: Node) {
  if (tsMorph.Node.isJSDocable(statement)) {
    for (const doc of statement.getJsDocs()) {
      doc.remove()
    }
  }
}
