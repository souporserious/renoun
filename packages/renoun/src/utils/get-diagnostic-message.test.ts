import { describe, test, expect } from 'vitest'
import { Project } from 'ts-morph'
import dedent from 'dedent'

import { getDiagnosticMessageText } from './get-diagnostic-message.js'

describe('getDiagnosticMessageText', () => {
  const project = new Project()

  test('returns a formatted message for simple diagnostics', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `const addNumbers = (a: number, b: number) => a + b; addNumbers(5, "5");`
    )
    const diagnostics = sourceFile.getPreEmitDiagnostics()
    const diagnostic = diagnostics[0]
    const result = getDiagnosticMessageText(diagnostic.getMessageText())

    expect(result).toMatchInlineSnapshot(
      `"Argument of type 'string' is not assignable to parameter of type 'number'."`
    )
  })

  test('returns a formatted message for chained diagnostics', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      dedent`
      interface Container<Type> { value: Type; }
      
      function wrapInContainer<T>(value: T): Container<T> {
        return { value };
      }
    
      const numberContainer: Container<number> = wrapInContainer("This should be a number");`,
      { overwrite: true }
    )
    const diagnostics = sourceFile.getPreEmitDiagnostics()
    const diagnostic = diagnostics[0]
    const result = getDiagnosticMessageText(diagnostic.getMessageText())

    expect(result).toMatchInlineSnapshot(`
      "Type 'Container<string>' is not assignable to type 'Container<number>'.
      Type 'string' is not assignable to type 'number'."
    `)
  })
})
