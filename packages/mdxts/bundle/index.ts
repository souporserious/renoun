import esbuild from 'esbuild'
import type { AsyncReturnType } from 'type-fest'
import type { FileData } from '../rehype'
import { rehypePlugin, getHighlighter } from '../rehype'

let highlighter: AsyncReturnType<typeof getHighlighter>

/** Bundle a set of MDX files into a single JavaScript file. */
export async function bundle({
  entryPoints,
  workingDirectory,
  theme,
  external = [],
}: {
  /** An array of files that each serve as an input to the bundling algorithm. */
  entryPoints: string[]

  /** The working directory used for the build, defaulting to the current working directory. */
  workingDirectory?: string

  /** The name of the theme to use for syntax highlighting. */
  theme?: string

  /** An array of modules to exclude from the bundle. */
  external?: string[]
}) {
  /** Only load the shiki highlighter once. */
  if (highlighter === undefined) {
    highlighter = await getHighlighter({ theme })
  }

  const allFileData: FileData[] = []
  const mdxPlugin = (await import('@mdx-js/esbuild')).default
  const result = await esbuild.build({
    entryPoints: entryPoints,
    absWorkingDir: workingDirectory,
    target: 'esnext',
    format: 'cjs',
    outdir: 'dist',
    bundle: true,
    minify: true,
    write: false,
    plugins: [
      mdxPlugin({
        rehypePlugins: [
          [
            rehypePlugin,
            {
              highlighter,
              onFileData: (fileData: FileData) => {
                allFileData.push(fileData)
              },
            },
          ],
        ],
      }),
    ],
    external: ['react', 'react-dom', ...external],
  })

  return entryPoints.map((filePath, index) => {
    const findData = (fileData) => fileData.path === filePath
    const fileData = allFileData.find(findData) || {}

    return {
      code: result.outputFiles[index].text,
      ...fileData,
    } as {
      code: string
    } & FileData
  })
}
