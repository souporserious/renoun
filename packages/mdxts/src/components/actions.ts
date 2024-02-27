'use server'
import { readFile, writeFile } from 'node:fs/promises'

export async function showErrors({
  sourcePath,
  sourcePathLine,
}: {
  sourcePath: string
  sourcePathLine: number
}) {
  'use server'
  if (!sourcePath || !sourcePathLine) {
    throw new Error(
      'The [sourcePath] prop was not provided. Make sure the mdxts/remark plugin is configured correctly.'
    )
  }
  const contents = await readFile(sourcePath, 'utf-8')
  const modifiedContents = contents
    .split('\n')
    .map((_line, index) => {
      if (index === sourcePathLine - 1) {
        return _line.includes('showErrors')
          ? _line.replace('showErrors', '')
          : `${_line.trimEnd()} showErrors`
      }
      return _line
    })
    .join('\n')

  writeFile(sourcePath, modifiedContents)
}
