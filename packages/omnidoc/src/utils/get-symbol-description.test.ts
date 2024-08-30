import { Project, SyntaxKind } from 'ts-morph'
import { getSymbolDescription } from './get-symbol-description'

describe('getSymbolDescription', () => {
  const project = new Project()

  test('parses a symbol with JSDoc', () => {
    const description = 'Provides the initial count.'
    const sourceFile = project.createSourceFile(
      'test.ts',
      `/** ${description} */\nexport const initialCount = 0`,
      { overwrite: true }
    )
    const symbol = sourceFile
      .getFirstDescendantByKind(SyntaxKind.VariableDeclaration)!
      .getSymbol()!

    expect(getSymbolDescription(symbol)).toEqual(description)
  })

  test('parses a symbol with a leading comment', () => {
    const description = 'Provides the initial count.'
    const sourceFile = project.createSourceFile(
      'test.ts',
      `// ${description}\nconst initialCount = 0`,
      { overwrite: true }
    )
    const symbol = sourceFile
      .getFirstDescendantByKind(SyntaxKind.VariableDeclaration)!
      .getSymbol()!

    expect(getSymbolDescription(symbol)).toEqual(description)
  })

  test('parses a function declaration', () => {
    const description = 'Increments the count.'
    const sourceFile = project.createSourceFile(
      'test.ts',
      `/** ${description} */\nexport function incrementCount() {}`,
      { overwrite: true }
    )
    const symbol = sourceFile
      .getFirstDescendantByKind(SyntaxKind.FunctionDeclaration)!
      .getSymbol()!

    expect(getSymbolDescription(symbol)).toEqual(description)
  })
})
