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
    const textSnippet = buildTextSnippet(usedLocals, sourceFile, declarationMap)
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
  declarationMap: Map<string, DeclarationInfo>
): string {
  const usedImports = getUsedImports(usedLocals, declarationMap)
  const fileStatements = sourceFile.getStatements()
  const lines: string[] = []

  for (const statement of fileStatements) {
    if (tsMorph.Node.isImportDeclaration(statement)) {
      const defaultImport = statement.getDefaultImport()?.getText()

      if (defaultImport) {
        statement.removeDefaultImport()

        if (usedImports.has(defaultImport)) {
          statement.setDefaultImport(defaultImport)
        }
      }

      const namespaceImport = statement.getNamespaceImport()?.getText()

      if (namespaceImport) {
        statement.removeNamespaceImport()

        if (usedImports.has(namespaceImport)) {
          statement.setNamespaceImport(namespaceImport)
        }
      }

      const namedImportStructures = statement
        .getNamedImports()
        .map((namedImport) => namedImport.getStructure())

      statement.removeNamedImports()

      const usedNamedImportStructures: tsMorph.ImportSpecifierStructure[] = []
      const unusedNamedImportStructures: {
        index: number
        structure: tsMorph.ImportSpecifierStructure
      }[] = []
      const usedIndex: number[] = []
      let usedCount = 0

      for (let index = 0; index < namedImportStructures.length; index++) {
        const structure = namedImportStructures[index]
        const localName = structure.alias ?? structure.name
        if (usedImports.has(localName)) {
          usedNamedImportStructures.push(structure)
          usedCount++
        } else {
          unusedNamedImportStructures.push({ index: index, structure })
        }
        usedIndex[index] = usedCount
      }

      statement.addNamedImports(usedNamedImportStructures)

      if (usedNamedImportStructures.length > 0) {
        lines.push(statement.getFullText())
      }

      if (defaultImport && !usedImports.has(defaultImport)) {
        statement.setDefaultImport(defaultImport)
      }

      if (namespaceImport && !usedImports.has(namespaceImport)) {
        statement.setNamespaceImport(namespaceImport)
      }

      for (const { index, structure } of unusedNamedImportStructures) {
        const insertionIndex = index === 0 ? 0 : usedIndex[index - 1]
        statement.insertNamedImport(insertionIndex, structure)
      }
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

/** Strip JSDoc from a statement. */
function stripJsDocs(statement: Node) {
  if (tsMorph.Node.isJSDocable(statement)) {
    for (const doc of statement.getJsDocs()) {
      doc.remove()
    }
  }
}
