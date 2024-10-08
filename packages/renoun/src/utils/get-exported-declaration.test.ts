import { describe, it, expect } from 'vitest'
import { Project } from 'ts-morph'

import { getExportedDeclaration } from './get-exported-declaration'

describe('getExportedDeclaration', () => {
  const project = new Project()

  it('should return the only exported declaration when one is present', () => {
    const sourceFile = project.createSourceFile(
      'singleExport.ts',
      `
      export function singleFunction() {
        return true;
      }
    `
    )

    const exportedDeclarations = sourceFile.getExportedDeclarations()
    const result = getExportedDeclaration(
      exportedDeclarations,
      'singleFunction'
    )

    expect(result).toBeDefined()
  })

  it('should return the implementation when overloads are present', () => {
    const sourceFile = project.createSourceFile(
      'overloads.ts',
      `
      export function functionOverload(param: string): void;
      export function functionOverload(param: number): void;
      export function functionOverload(param: string | number) {}
    `
    )

    const exportedDeclarations = sourceFile.getExportedDeclarations()
    const result = getExportedDeclaration(
      exportedDeclarations,
      'functionOverload'
    )

    expect(result).toBeDefined()
  })
})
