import path from 'node:path'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'

const publicDirectory = path.join(process.cwd(), 'public')

const basePath = `node_modules/mdxts/node_modules`
const pathsToCopy = [
  `shiki/languages/typescript.tmLanguage.json`,
  `shiki/languages/tsx.tmLanguage.json`,
]

/** Creates the public files necessary for the Editor component. */
export async function createPublicFiles() {
  /* Create public directory if it doesn't exist */
  await fs
    .stat(publicDirectory)
    .catch(() =>
      fs.mkdir(path.join(publicDirectory, 'mdxts'), { recursive: true })
    )

  if (
    !pathsToCopy.every((url) =>
      existsSync(path.join(publicDirectory, 'mdxts', path.basename(url)))
    )
  ) {
    /* Copy files */
    await Promise.all(
      pathsToCopy.map(async (url) => {
        return fs.copyFile(
          path.join(basePath, url),
          path.join(publicDirectory, 'mdxts', path.basename(url))
        )
      })
    )

    console.log(
      `mdxts: copied textmate grammars to ${publicDirectory.replace(
        process.cwd(),
        ''
      )}`
    )
  }
}
