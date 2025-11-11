import { getTsMorph } from './ts-morph.js'
import type { Node } from './ts-morph.js'

const tsMorph = getTsMorph()

/** Returns a stable position for an exported declaration, anchored at its identifier when available. */
export function getExportPosition(node: Node): number {
  // Default to the node start to avoid leading trivia like triple-slash refs.
  let position = node.getStart()

  if (
    tsMorph.Node.isVariableDeclaration(node) ||
    tsMorph.Node.isFunctionDeclaration(node) ||
    tsMorph.Node.isClassDeclaration(node) ||
    tsMorph.Node.isInterfaceDeclaration(node) ||
    tsMorph.Node.isTypeAliasDeclaration(node) ||
    tsMorph.Node.isEnumDeclaration(node)
  ) {
    const nameNode = node.getNameNode()
    if (nameNode) {
      position = nameNode.getStart()
    }
  }

  return position
}
