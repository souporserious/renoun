import { capitalCase, kebabCase } from 'case-anything'
import type { SourceFiles } from 'mdxts'
// import { createSource } from 'mdxts'
import { bundle } from 'mdxts/bundle'
import { getEditorLink } from 'mdxts/utils'

/**
 * Returns a constructed source link for the local IDE in development or a GitHub
 * link in production.
 */
export function getSourceLink({ path }) {
  if (process.env.NODE_ENV === 'development') {
    return getEditorLink({ path })
  }

  return `https://github.com/souporserious/mdxts/tree/main${path}`
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
    path: getSourceLink({ path: sourceFile.getFilePath() }),
    // path: sourceFile.getFilePath().replace(process.cwd(), ''),
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
        mdx: JSON.stringify(mdx.code),
      }
    })
  )
}
