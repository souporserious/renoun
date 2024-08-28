import dedent from 'dedent'
import { Project, SyntaxKind } from 'ts-morph'
import { getPropertyDefaultValue } from './getPropertyDefaultValue'

describe('getParameterDefaultValue', () => {
  const project = new Project()

  test('function parameters', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `const createCounter = (initialCount = 0, options: { incrementAmount: number } = { incrementAmount: 1 }) => {}`,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFirstDescendantByKindOrThrow(
      SyntaxKind.ArrowFunction
    )
    const defaultValues = functionDeclaration
      .getParameters()
      .map(getPropertyDefaultValue)

    expect(defaultValues).toEqual([0, { incrementAmount: 1 }])
  })

  test('renamed property default values', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `function useCounter({ initialCount: renamedInitialCount = 0 }: { initialCount: number }) {}`,
      { overwrite: true }
    )
    const [parameter] = sourceFile
      .getFunctionOrThrow('useCounter')
      .getParameters()

    expect(getPropertyDefaultValue(parameter)).toEqual({ initialCount: 0 })
  })

  test('template string default values', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const a = 1; const b = 2; const createCounter = (initialCount = `${a + b}`) => {}',
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFirstDescendantByKindOrThrow(
      SyntaxKind.ArrowFunction
    )
    const defaultValue = getPropertyDefaultValue(
      functionDeclaration.getParameters().at(0)!
    )

    expect(defaultValue).toEqual('3')
  })

  test('function parameter default values', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `const createCounter = (initialCount = () => 0) => {}`,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFirstDescendantByKindOrThrow(
      SyntaxKind.ArrowFunction
    )
    const defaultValue = getPropertyDefaultValue(
      functionDeclaration.getParameters().at(0)!
    )

    expect(defaultValue).toEqual('() => 0')
  })

  test('destructured properties', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `const createCounter = ({ initialCount = 0 }) => {}`,
      { overwrite: true }
    )
    const functionDeclaration =
      sourceFile.getVariableDeclarationOrThrow('createCounter')
    const defaultValue = getPropertyDefaultValue(
      functionDeclaration
        .getInitializerIfKindOrThrow(SyntaxKind.ArrowFunction)
        .getParameters()
        .at(0)!
    )

    expect(defaultValue).toEqual({ initialCount: 0 })
  })

  test('function body default values', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `const Text = (props) => { const { initialCount, incrementAmount = 1 } = props }`,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFirstDescendantByKindOrThrow(
      SyntaxKind.ArrowFunction
    )
    const defaultValue = getPropertyDefaultValue(
      functionDeclaration.getParameters().at(0)!
    )

    expect(defaultValue).toEqual({ incrementAmount: 1 })
  })

  test('function parameter and body default values', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      type TextProps = { initialCount: number; incrementAmount?: number }
      
      const Text = (props: TextProps = { initialCount: 0 }) => {
        const { initialCount, incrementAmount = 1 } = props
      }`,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFirstDescendantByKindOrThrow(
      SyntaxKind.ArrowFunction
    )
    const defaultValue = getPropertyDefaultValue(
      functionDeclaration.getParameters().at(0)!
    )

    expect(defaultValue).toEqual({ initialCount: 0, incrementAmount: 1 })
  })
})
