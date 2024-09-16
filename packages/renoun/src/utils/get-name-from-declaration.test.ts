import { Project } from 'ts-morph'
import { getNameFromDeclaration } from './get-name-from-declaration'

describe('getMainExportDeclaration', () => {
  const project = new Project()

  it('gets name from function declaration', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `export function Foo() {}`,
      { overwrite: true }
    )
    const functionDeclaration = sourceFile.getFunctionOrThrow('Foo')
    const name = getNameFromDeclaration(functionDeclaration)

    expect(name).toBe('Foo')
  })

  it('gets name from variable declaration', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `export const Foo = () => {}`,
      { overwrite: true }
    )
    const variableDeclaration = sourceFile.getVariableDeclarationOrThrow('Foo')
    const name = getNameFromDeclaration(variableDeclaration)

    expect(name).toBe('Foo')
  })

  it('gets name from class declaration', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `export class Foo {}`,
      { overwrite: true }
    )
    const classDeclaration = sourceFile.getClassOrThrow('Foo')
    const name = getNameFromDeclaration(classDeclaration)

    expect(name).toBe('Foo')
  })
})
