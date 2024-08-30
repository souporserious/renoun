import { Symbol, Node } from 'ts-morph'

/** Gets the description from a symbol's JSDoc or leading comment range. */
export function getSymbolDescription(symbol: Symbol) {
  const declarations = symbol.getDeclarations().map((declaration) => {
    if (Node.isVariableDeclaration(declaration)) {
      const ancestor = declaration.getFirstAncestor((node) => {
        if (Node.isSourceFile(node)) {
          return false
        }
        return (
          Node.isJSDocable(node) || node.getLeadingCommentRanges().length > 0
        )
      })
      if (ancestor) {
        return ancestor
      }
    }
    return declaration
  })

  const description = declarations
    .map((declaration) => {
      if (Node.isJSDocable(declaration)) {
        return declaration
          .getJsDocs()
          .map((doc) => doc.getComment())
          .flat()
      }

      return declaration
        .getLeadingCommentRanges()
        .map((commentRange) => cleanCommentRange(commentRange.getText()))
        .flat()
    })
    .join('\n')

  if (description) {
    return description
  }

  /** Try extracting from leading trivia and parsing */
  const valueDeclaration = symbol.getValueDeclaration()

  if (!valueDeclaration) {
    return
  }

  const commentRanges = valueDeclaration
    .getLeadingCommentRanges()
    .map((commentRange) => cleanCommentRange(commentRange.getText()))
    .join('\n')

  return commentRanges || undefined
}

/** Remove comment markers and trim whitespace. */
function cleanCommentRange(commentRange: string) {
  return (
    commentRange
      // remove double slash comments //
      .replace(/\/\//g, '')
      // remove js doc syntax /** */
      .replace(/\/\*\*|\*\//g, '')
      // remove leading * and whitespace for multiline js doc comments
      .replace(/^\s*\* /gm, '')
      .trim()
  )
}
