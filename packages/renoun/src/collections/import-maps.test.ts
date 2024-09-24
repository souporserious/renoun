import { test, expect } from 'vitest'
import { Project } from 'ts-morph'

import { writeCollectionImportMaps } from './write-collection-import-maps.js'

const project = new Project()

project.createSourceFile(
  'node_modules/renoun/collections/index.js',
  'export const createCollection = (options: any) => {}',
  { overwrite: true }
)
project.createSourceFile(
  'node_modules/renoun/collections/index.d.ts',
  'export declare function createCollection(options: any): void',
  { overwrite: true }
)

const indexSourceFile = project.createSourceFile(
  'index.ts',
  `
import { createCollection } from 'renoun/collections'

const posts = createCollection('posts/*.md')

const components = createCollection('components/*.md', {
  importMap: [
    slug => import(\`./components/\${slug}.js\`)
],
  tsConfigFilePath: 'tsconfig.json',
  })
`,
  { overwrite: true }
)

test('it should work', async () => {
  await writeCollectionImportMaps(project)
  console.log(indexSourceFile.getText())
})
