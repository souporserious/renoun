import { Project } from 'ts-morph'
import { getExportedSourceFiles } from './get-exported-source-files'

describe('getExportedSourceFiles', () => {
  const project = new Project()

  it('gets exported source files', () => {
    project.createSourceFile(
      `src/components/Button.tsx`,
      `export function Button() {}`
    )
    project.createSourceFile(
      `src/components/Menu.tsx`,
      `export function Menu() {}`
    )
    const sourceFile = project.createSourceFile(
      'src/index.ts',
      `export * from './components/Menu'`
    )
    const [exportedSourceFile] = getExportedSourceFiles([sourceFile])

    expect(exportedSourceFile.getFilePath()).toBe(
      `${process.cwd()}/src/components/Menu.tsx`
    )
  })
})
