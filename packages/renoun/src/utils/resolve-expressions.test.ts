import { describe, test, expect } from 'vitest'
import { getTsMorph } from './ts-morph.ts'

import {
  resolveLiteralExpression,
  resolveArrayLiteralExpression,
  resolveObjectLiteralExpression,
} from './resolve-expressions.ts'

const { Project, SyntaxKind } = getTsMorph()

const project = new Project()

describe('resolveLiteralExpression', () => {
  test.concurrent('null literals', () => {
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

  test.concurrent('boolean literals', () => {
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

  test.concurrent('numeric literals', () => {
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

  test.concurrent('string literals', () => {
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

  test.concurrent('object literal expressions', () => {
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

  test.concurrent('array literal expressions via resolveLiteralExpression', () => {
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

  test.concurrent('parenthesized expressions', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const test = (123);',
      { overwrite: true }
    )
    const numericLiteral = sourceFile.getFirstDescendantByKind(
      SyntaxKind.ParenthesizedExpression
    )

    expect(resolveLiteralExpression(numericLiteral!)).toBe(123)
  })

  test.concurrent('prefix unary expressions', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const test = -123;',
      { overwrite: true }
    )
    const numericLiteral = sourceFile.getFirstDescendantByKind(
      SyntaxKind.PrefixUnaryExpression
    )

    expect(resolveLiteralExpression(numericLiteral!)).toBe(-123)
  })

  test.concurrent('conditional expressions', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const test = true ? 1 : 2;',
      { overwrite: true }
    )
    const conditionalExpression = sourceFile.getFirstDescendantByKind(
      SyntaxKind.ConditionalExpression
    )

    expect(resolveLiteralExpression(conditionalExpression!)).toBe(1)
  })

  test.concurrent('binary expressions', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const test = 1 + 2;',
      { overwrite: true }
    )
    const binaryExpression = sourceFile.getFirstDescendantByKind(
      SyntaxKind.BinaryExpression
    )

    expect(resolveLiteralExpression(binaryExpression!)).toBe(3)
  })

  test.concurrent('template literals', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const test = `hello`;',
      { overwrite: true }
    )
    const templateExpression = sourceFile.getFirstDescendantByKind(
      SyntaxKind.NoSubstitutionTemplateLiteral
    )

    expect(resolveLiteralExpression(templateExpression!)).toBe('hello')
  })

  test.concurrent('template literals with substitutions', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      'const base = "base"; const test = `content/${base}`;',
      { overwrite: true }
    )
    const templateExpression = sourceFile.getFirstDescendantByKind(
      SyntaxKind.TemplateExpression
    )

    expect(resolveLiteralExpression(templateExpression!)).toBe('content/base')
  })

  test.concurrent('identifiers', () => {
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

  test.concurrent('identifiers across files', () => {
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

  test.concurrent('as const values', () => {
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
  test.concurrent('array literal expressions', () => {
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

  test.concurrent('nested array literal expressions', () => {
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
  test.concurrent('property assignments', () => {
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

  test.concurrent('nested property assignments', () => {
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

  test.concurrent('spread assignments', () => {
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

  test.concurrent('spread assignments without identifier', () => {
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
