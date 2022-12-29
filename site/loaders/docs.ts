import { capitalCase, kebabCase } from 'case-anything'
import type { SourceFiles } from 'mdxts'
// import { createSource } from 'mdxts'
import { bundle } from 'mdxts/bundle'

function getMetaFromSourceFile(sourceFile: SourceFiles[number]) {
  let name = sourceFile.getBaseNameWithoutExtension()

  if (name === 'index') {
    name = sourceFile.getDirectory().getBaseName()
  }

  // Remove prefix from path name if it exists (e.g. 01. or 01-)
  const strippedName = name.replace(/^(\d+\.|-)/, '')

  // Get the order from the name if the prefix exists (e.g. 01. or 01-)
  const order = Number(name.split(/\.|-/)[0]) ?? 0

  return {
    name: capitalCase(strippedName).replace(/-/g, ' '),
    slug: kebabCase(strippedName),
    order,
  }
}

export default async function getDocs(sourceFiles: SourceFiles) {
  return Promise.all(
    sourceFiles.map(async (sourceFile) => {
      const path = sourceFile.getFilePath()
      const [mdx] = await bundle({ entryPoints: [path] })
      const { name, slug, order } = getMetaFromSourceFile(sourceFile)

      return {
        name,
        slug,
        order,
        mdx: JSON.stringify(mdx.code),
        path:
          process.env.NODE_ENV === 'development'
            ? path
            : path.replace(process.cwd(), ''),
      }
    })
  )
}
