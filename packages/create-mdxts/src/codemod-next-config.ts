import type { SourceFile } from 'ts-morph'
import { Node, SyntaxKind } from 'ts-morph'

export function codemodNextJsConfig(sourceFile: SourceFile) {
  const mdxtsRequire = `const { createMdxtsPlugin } = require('mdxts/next');\n`
  const withMdxtsSetup = `const withMdxts = createMdxtsPlugin({\n  theme: 'nord'\n});\n\n`

  sourceFile.insertText(0, `${mdxtsRequire}${withMdxtsSetup}`)

  sourceFile.forEachDescendant((node) => {
    if (Node.isExpressionStatement(node)) {
      const expression = node.getExpression()
      const returnStatements = expression?.getDescendantsOfKind(
        SyntaxKind.ReturnStatement
      )

      if (returnStatements.length) {
        returnStatements.forEach((returnStatement) => {
          const originalReturnText = returnStatement.getExpression()?.getText()

          if (originalReturnText) {
            returnStatement.replaceWithText(
              `return withMdxts(${originalReturnText});`
            )
          }
        })
      } else if (
        Node.isBinaryExpression(expression) &&
        expression.getLeft().getText() === 'module.exports'
      ) {
        const right = expression.getRight().getText()
        expression.replaceWithText(`module.exports = withMdxts(${right});`)
      }
    }
  })

  sourceFile.formatText()
}

export function codemodNextMjsConfig(sourceFile: SourceFile) {
  const importDeclarations = sourceFile.getImportDeclarations()
  const defaultExport = sourceFile.getDefaultExportSymbolOrThrow()

  if (!defaultExport) {
    console.error(
      'Could not find default export in next.config.mjs. Please add `export default` to your next.config.mjs file and wrap it in `withMdxts()` plugin.'
    )
    process.exit(1)
  }

  const lastImport = importDeclarations.at(-1)
  const insertPosition = lastImport ? lastImport.getEnd() + 1 : 0
  const mdxtsImport = `import { createMdxtsPlugin } from 'mdxts/next';\n`
  const exportDeclaration = defaultExport.getDeclarations().at(0)

  if (
    Node.isFunctionDeclaration(exportDeclaration) ||
    Node.isFunctionExpression(exportDeclaration) ||
    Node.isArrowFunction(exportDeclaration)
  ) {
    exportDeclaration
      .getDescendantsOfKind(SyntaxKind.ReturnStatement)
      .forEach((node) => {
        const originalReturnText = node.getExpression()?.getText()

        if (originalReturnText) {
          node.replaceWithText(`return withMdxts(${originalReturnText});`)
        }
      })
  } else if (Node.isExportAssignment(exportDeclaration)) {
    const originalText = exportDeclaration.getExpression().getText()
    exportDeclaration.setExpression(`withMdxts(${originalText})`)
  }

  sourceFile
    .insertText(
      insertPosition,
      `${mdxtsImport}\nconst withMdxts = createMdxtsPlugin({\ntheme: 'nord'\n});\n\n`
    )
    .formatText()
}
