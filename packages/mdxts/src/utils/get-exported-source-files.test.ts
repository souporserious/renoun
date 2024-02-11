import { Project } from 'ts-morph'
import { getExportedSourceFiles } from './get-exported-source-files'

describe('getExportedSourceFiles', () => {
  const project = new Project()

  it('gets exported source files', () => {
    project.createSourceFile(
      `src/components/Button.tsx`,
      `export function Button() {}`,
      { overwrite: true }
    )
    project.createSourceFile(
      `src/components/Menu.tsx`,
      `export function Menu() {}`,
      { overwrite: true }
    )
    const sourceFile = project.createSourceFile(
      'src/index.ts',
      `export * from './components/Menu'`,
      { overwrite: true }
    )
    const [exportedSourceFile] = getExportedSourceFiles([sourceFile])

    expect(exportedSourceFile.getFilePath()).toBe(
      `${process.cwd()}/src/components/Menu.tsx`
    )
  })

  it('accounts for internal JSDoc tag', () => {
    project.createSourceFile(
      `src/components/Menu.tsx`,
      `/** @internal */\nexport function Menu() {}`,
      { overwrite: true }
    )
    const sourceFile = project.createSourceFile(
      'src/index.ts',
      `export * from './components/Menu'`,
      { overwrite: true }
    )
    const exportedSourceFiles = getExportedSourceFiles([sourceFile])

    expect(exportedSourceFiles).toHaveLength(0)
  })
})
