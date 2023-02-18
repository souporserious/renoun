import type { SourceFiles } from 'mdxts'
import { bundle } from 'mdxts/bundle'
import { getMetadata } from 'mdxts/utils'

export default async function getDocs(sourceFiles: SourceFiles) {
  const mdxContents = await bundle({
    entryPoints: sourceFiles.map((sourceFile) => sourceFile.getFilePath()),
    workingDirectory: process.cwd() + '/docs',
  })

  return Promise.all(
    sourceFiles.map(async (sourceFile, index) => {
      const mdx = mdxContents[index]
      const { name, slug, order, path } = getMetadata(sourceFile)

      return {
        name,
        slug,
        pathname: `/docs/${slug}`,
        order,
        path,
        mdx,
        // extension
        // references,
        // examples,
        // source, original source file
        // compiled, exectuable MDX or code file, used to render code as well as load examples into an editor
      }
    })
  )
}
