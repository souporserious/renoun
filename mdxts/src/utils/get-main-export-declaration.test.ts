import { Project, Node } from 'ts-morph'
import { getMainExportDeclaration } from './get-main-export-declaration'

describe('getMainExportDeclaration', () => {
  const project = new Project()

  it('gets export default declaration', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `export function Foo() {}\nexport default function Bar() {}`,
      { overwrite: true }
    )
    const mainExportDeclaration = getMainExportDeclaration(sourceFile)

    if (Node.isFunctionDeclaration(mainExportDeclaration)) {
      expect(mainExportDeclaration.getName()).toBe('Bar')
    }
  })

  it('gets named export declaration', () => {
    const sourceFile = project.createSourceFile(
      'menu-item.tsx',
      `export const icons = {}\nexport function MenuItem() {}`,
      { overwrite: true }
    )
    const mainExportDeclaration = getMainExportDeclaration(sourceFile)

    if (Node.isFunctionDeclaration(mainExportDeclaration)) {
      expect(mainExportDeclaration.getName()).toBe('MenuItem')
    }
  })

  it('prefers export default declaration', () => {
    const sourceFile = project.createSourceFile(
      'menu-item.tsx',
      `export function MenuItem() {}\nexport default function Foo() {}`,
      { overwrite: true }
    )
    const mainExportDeclaration = getMainExportDeclaration(sourceFile)

    if (Node.isFunctionDeclaration(mainExportDeclaration)) {
      expect(mainExportDeclaration.getName()).toBe('Foo')
    }
  })
})
