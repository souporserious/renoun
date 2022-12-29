import { kebabCase } from 'case-anything'
import type { SourceFiles } from 'mdxts'
// import { createSource } from 'mdxts'
import { bundle } from 'mdxts/bundle'

export default async function getDocs(sourceFiles: SourceFiles) {
  return Promise.all(
    sourceFiles.map(async (sourceFile) => {
      const path = sourceFile.getFilePath()
      const baseName = sourceFile.getBaseName()
      const [mdx] = await bundle({ entryPoints: [path] })
      const name = baseName.replace(/\.mdx$/, '')

      return {
        mdx: JSON.stringify(mdx.code),
        name: name.replace(/\.mdx$/, ''),
        slug: kebabCase(name),
        path:
          process.env.NODE_ENV === 'development'
            ? path
            : path.replace(process.cwd(), ''),
      }
    })
  )
}
