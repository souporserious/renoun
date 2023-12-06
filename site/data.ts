import { createSourceFiles } from 'mdxts'

export const allDocs = createSourceFiles('docs/**/*.mdx', {
  baseDirectory: 'docs',
})

export const allComponents = createSourceFiles('components/**/index.(ts|tsx)')
