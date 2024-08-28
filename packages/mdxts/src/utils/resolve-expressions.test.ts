import { Project, SyntaxKind } from 'ts-morph'
import {
  resolveLiteralExpression,
  resolveArrayLiteralExpression,
  resolveObjectLiteralExpression,
} from './resolveExpressions'

const project = new Project()

describe('resolveLiteralExpression', () => {
  test('null literals', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const test = null;',
      { overwrite: true }
    )
    const nullLiteral = sourceFile.getFirstDescendantByKind(
      SyntaxKind.NullKeyword
    )

    expect(resolveLiteralExpression(nullLiteral!)).toBeNull()
  })

  test('boolean literals', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const test = true;',
      { overwrite: true }
    )
    const trueLiteral = sourceFile.getFirstDescendantByKind(
      SyntaxKind.TrueKeyword
    )

    expect(resolveLiteralExpression(trueLiteral!)).toBe(true)
  })

  test('numeric literals', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const test = 123;',
      { overwrite: true }
    )
    const numericLiteral = sourceFile.getFirstDescendantByKind(
      SyntaxKind.NumericLiteral
    )

    expect(resolveLiteralExpression(numericLiteral!)).toBe(123)
  })

  test('string literals', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const test = "test";',
      { overwrite: true }
    )
    const stringLiteral = sourceFile.getFirstDescendantByKind(
      SyntaxKind.StringLiteral
    )

    expect(resolveLiteralExpression(stringLiteral!)).toBe('test')
  })

  test('object literal expressions', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const test = { property: "test" };',
      { overwrite: true }
    )
    const objectLiteral = sourceFile.getFirstDescendantByKind(
      SyntaxKind.ObjectLiteralExpression
    )

    expect(resolveLiteralExpression(objectLiteral!)).toEqual({
      property: 'test',
    })
  })

  test('array literal expressions', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const test = [1, 2, 3];',
      { overwrite: true }
    )
    const arrayLiteral = sourceFile.getFirstDescendantByKind(
      SyntaxKind.ArrayLiteralExpression
    )

    expect(resolveLiteralExpression(arrayLiteral!)).toEqual([1, 2, 3])
  })

  test('identifiers', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const test = 123; const anotherTest = test;',
      { overwrite: true }
    )
    const identifier = sourceFile
      .getVariableDeclaration('anotherTest')!
      .getInitializer()!

    expect(resolveLiteralExpression(identifier)).toBe(123)
  })

  test('identifiers across files', () => {
    project.createSourceFile('foo.ts', 'export const foo = 123;', {
      overwrite: true,
    })
    const sourceFile = project.createSourceFile(
      'test.ts',
      `import { foo } from './foo.ts'; const anotherTest = foo;`,
      { overwrite: true }
    )
    const identifier = sourceFile
      .getVariableDeclaration('anotherTest')!
      .getInitializer()!

    expect(resolveLiteralExpression(identifier)).toBe(123)
  })

  test('as const values', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const test = 123 as const;',
      { overwrite: true }
    )
    const identifier = sourceFile
      .getVariableDeclaration('test')!
      .getInitializer()!

    expect(resolveLiteralExpression(identifier)).toBe(123)
  })
})

describe('resolveArrayLiteralExpression', () => {
  test('array literal expressions', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const array = [1, 2, 3];',
      { overwrite: true }
    )
    const arrayLiteral = sourceFile.getFirstDescendantByKind(
      SyntaxKind.ArrayLiteralExpression
    )
    const array = resolveArrayLiteralExpression(arrayLiteral!)

    expect(array).toEqual([1, 2, 3])
  })

  test('nested array literal expressions', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const array = [[1], [2], [3]];',
      { overwrite: true }
    )
    const arrayLiteral = sourceFile.getFirstDescendantByKind(
      SyntaxKind.ArrayLiteralExpression
    )
    const array = resolveArrayLiteralExpression(arrayLiteral!)

    expect(array).toEqual([[1], [2], [3]])
  })
})

describe('resolveObjectLiteralExpression', () => {
  test('property assignments', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const object = { property: "test" };',
      { overwrite: true }
    )
    const objectLiteral = sourceFile.getFirstDescendantByKind(
      SyntaxKind.ObjectLiteralExpression
    )
    const object = resolveObjectLiteralExpression(objectLiteral!)

    expect(object).toEqual({ property: 'test' })
  })

  test('nested property assignments', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const object = { nested: { property: "test" } };',
      { overwrite: true }
    )
    const objectLiteral = sourceFile.getFirstDescendantByKind(
      SyntaxKind.ObjectLiteralExpression
    )
    const object = resolveObjectLiteralExpression(objectLiteral!)

    expect(object).toEqual({ nested: { property: 'test' } })
  })

  test('spread assignments', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const spread = { spread: "test" };\nconst object = { ...spread };',
      { overwrite: true }
    )
    const objectLiteral = sourceFile.getFirstDescendantByKind(
      SyntaxKind.ObjectLiteralExpression
    )
    const object = resolveObjectLiteralExpression(objectLiteral!)

    expect(object).toEqual({ spread: 'test' })
  })

  test('spread assignments without identifier', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const object = { ...{ spread: "test" } };',
      { overwrite: true }
    )
    const objectLiteral = sourceFile.getFirstDescendantByKind(
      SyntaxKind.ObjectLiteralExpression
    )
    const object = resolveObjectLiteralExpression(objectLiteral!)

    expect(object).toEqual({ spread: 'test' })
  })
})
