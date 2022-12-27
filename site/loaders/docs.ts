// import { kebabCase } from 'case-anything'
// import { SourceFile } from 'mdxts'
// import { parseMDX } from './parse-mdx'

export default async function getDocs(sourceFiles) {
  return sourceFiles.map((sourceFile, index) => {
    const path = sourceFile.getFilePath()
    const baseName = sourceFile.getBaseName()
    // const mdx = sourceFile.getMDX()
    const name = baseName.replace(/\.mdx$/, '')

    return {
      //   mdx,
      //   name: mdx.data?.title ?? name.replace(/\.mdx$/, ''),
      //   slug: kebabCase(name),
      slug: name,
      path:
        process.env.NODE_ENV === 'development'
          ? path
          : path.replace(process.cwd(), ''),
    }
  })
}
