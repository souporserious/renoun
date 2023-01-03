import type { SourceFiles } from 'mdxts'
import { bundle } from 'mdxts/bundle'
import { getData } from 'mdxts/utils'

export default async function getDocs(sourceFiles: SourceFiles) {
  return Promise.all(
    sourceFiles
      .filter(
        (sourceFile) => sourceFile.getBaseNameWithoutExtension() !== 'index'
      )
      .map(async (sourceFile) => {
        const metaData: any = getData(sourceFile)

        if (sourceFile.getExtension() === 'mdx') {
          const [mdx] = await bundle({
            entryPoints: [sourceFile.getFilePath()],
          })

          metaData.mdx = mdx
        }

        return {
          ...metaData,
          name: metaData.basename,
          slug: `react/${metaData.slug}`,
        }
      })
  )
}
