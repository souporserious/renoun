import esbuild from 'esbuild'
import type { AsyncReturnType } from 'type-fest'
import type { FileData } from '../rehype'
import { rehypePlugin, getHighlighter } from '../rehype'
import { transformCode } from '../utils/transform-code'

let highlighter: AsyncReturnType<typeof getHighlighter>

export async function bundle({
  entryPoints,
  workingDirectory,
  theme,
}: {
  entryPoints: string[]
  workingDirectory?: string
  theme?: string
}) {
  /** Only load the shiki highlighter once. */
  if (highlighter === undefined) {
    highlighter = await getHighlighter()
  }

  const allFileData: FileData[] = []
  const mdxPlugin = (await import('@mdx-js/esbuild')).default
  const result = await esbuild.build({
    entryPoints: entryPoints,
    absWorkingDir: workingDirectory,
    target: 'esnext',
    format: 'esm',
    // platform: 'browser',
    bundle: true,
    write: false,
    // minify: process.env.NODE_ENV === 'production',
    plugins: [
      mdxPlugin({
        providerImportSource: '@mdx-js/react',
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
    external: ['react', 'react-dom', '@mdx-js/react'],
  })
  const texts = await Promise.all(
    result.outputFiles.map((file) => transformCode(file.text))
  )

  return entryPoints.map((filePath, index) => {
    const { path, ...data } =
      allFileData.find((fileData) => fileData.path === filePath) || {}

    return {
      code: texts[index],
      path: filePath,
      data,
    }
  })
}
