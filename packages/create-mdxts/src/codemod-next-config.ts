import type { SourceFile, ExportAssignment } from 'ts-morph'
import { Node, SyntaxKind } from 'ts-morph'

export function codemodNextJsConfig(sourceFile: SourceFile) {
  const requireDeclarations = sourceFile
    .getVariableDeclarations()
    .filter(
      (variableDeclaration) =>
        variableDeclaration
          .getInitializerIfKind(SyntaxKind.CallExpression)
          ?.getExpression()
          .getText() === 'require'
    )
  const lastRequire =
    requireDeclarations.length > 0
      ? requireDeclarations[requireDeclarations.length - 1]
      : null
  const insertPosition = lastRequire ? lastRequire.getEnd() + 1 : 0
  const mdxtsRequire = `const { createMdxtsPlugin } = require('mdxts/next');\n`

  sourceFile
    .insertText(
      insertPosition,
      `${mdxtsRequire}\nconst withMdxts = createMdxtsPlugin({\n  theme: 'nord'\n});\n\n`
    )
    .formatText()

  sourceFile.forEachDescendant((node) => {
    if (Node.isExpressionStatement(node)) {
      const expression = node.getExpression()
      if (Node.isBinaryExpression(expression)) {
        const left = expression.getLeft()
        const right = expression.getRight()
        if (left.getText() === 'module.exports') {
          expression
            .replaceWithText(`module.exports = withMdxts(${right.getText()})`)
            .formatText()
        }
      }
    }
  })
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
  const exportDeclaration = defaultExport
    .getDeclarations()
    .at(0) as ExportAssignment
  const originalText = exportDeclaration.getExpression().getText()
  const lastImport = importDeclarations.at(-1)
  const insertPosition = lastImport ? lastImport.getEnd() + 1 : 0
  const mdxtsImport = `import { createMdxtsPlugin } from 'mdxts/next';\n`

  exportDeclaration.setExpression(`withMdxts(${originalText})`)

  sourceFile
    .insertText(
      insertPosition,
      `${mdxtsImport}\nconst withMdxts = createMdxtsPlugin({\ntheme: 'nord'\n});\n\n`
    )
    .formatText()
}
