import { SourceFile } from 'ts-morph'

export { SourceFile }

export type SourceFiles = SourceFile[]

export function Project() {
  return null
}

// Project sets up a ts-morph project with the correct tsconfig.json
// it can compile all MDX as well as run codemods for Markdown
// const project = new Project({
//     include: ['packages/**/*.{ts,tsx}'],
// })
// sourceFile.addHeading(1, 'Hello World')
