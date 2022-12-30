import { capitalCase, kebabCase } from 'case-anything'
import type { SourceFiles } from 'mdxts'
// import { createSource } from 'mdxts'
import { bundle } from 'mdxts/bundle'
import { getEditorPath } from 'mdxts/utils'

/**
 * Returns a constructed source link for the local IDE in development or a GitHub
 * link in production.
 */
export function getSourceLink(path: string) {
  if (process.env.NODE_ENV === 'development') {
    return getEditorPath({ path })
  }

  return `https://github.com/souporserious/mdxts/tree/main${path.replace(
    process.cwd(),
    ''
  )}`
}

function getMetaFromSourceFile(sourceFile: SourceFiles[number]) {
  let name = sourceFile.getBaseNameWithoutExtension()

  if (name === 'index') {
    name = sourceFile.getDirectory().getBaseName()
  }

  // Remove prefix from path name if it exists (e.g. 01. or 01-)
  const strippedName = name.replace(/^(\d+\.|-)/, '')
  const order = Number(name.split(/\.|-/)[0]) ?? 0

  return {
    name: capitalCase(strippedName).replace(/-/g, ' '),
    slug: kebabCase(strippedName),
    path: getSourceLink(sourceFile.getFilePath()),
    order,
  }
}

export default async function getDocs(sourceFiles: SourceFiles) {
  return Promise.all(
    sourceFiles.map(async (sourceFile) => {
      const [mdx] = await bundle({
        entryPoints: [sourceFile.getFilePath()],
      })
      const { name, slug, order, path } = getMetaFromSourceFile(sourceFile)

      return {
        name,
        slug,
        order,
        path,
        mdx,
      }
    })
  )
}
