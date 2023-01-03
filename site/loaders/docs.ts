import type { SourceFiles } from 'mdxts'
import { bundle } from 'mdxts/bundle'
import { getData } from 'mdxts/utils'

export default async function getDocs(sourceFiles: SourceFiles) {
  return Promise.all(
    sourceFiles.map(async (sourceFile) => {
      const [mdx] = await bundle({
        entryPoints: [sourceFile.getFilePath()],
      })
      const { name, slug, order, path } = getData(sourceFile)

      return {
        name,
        slug,
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
