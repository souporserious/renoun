import { existsSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import fetch from 'node-fetch'

const publicDirectory = path.join(process.cwd(), 'public')

const pathsToCopy = {
  'onigasm.wasm': `https://unpkg.com/onigasm@2.2.5/lib/onigasm.wasm`,
  'javascript.tmLanguage.json': `https://unpkg.com/shiki@0.12.1/languages/javascript.tmLanguage.json`,
  'jsx.tmLanguage.json': `https://unpkg.com/shiki@0.12.1/languages/jsx.tmLanguage.json`,
  'typescript.tmLanguage.json': `https://unpkg.com/shiki@0.12.1/languages/typescript.tmLanguage.json`,
  'tsx.tmLanguage.json': `https://unpkg.com/shiki@0.12.1/languages/tsx.tmLanguage.json`,
}

/** Creates the public files necessary for the Editor component. */
export async function createPublicFiles() {
  /* Create public directory if it doesn't exist */
  fs.stat(publicDirectory).catch(() => fs.mkdir(publicDirectory))

  if (
    !Object.keys(pathsToCopy).some((filename) =>
      existsSync(path.join(publicDirectory, filename))
    )
  ) {
    /* Copy files */
    await Promise.all(
      Object.entries(pathsToCopy).map(async ([filename, url]) => {
        const data = await fetch(url)
        const buffer = await data.arrayBuffer()

        await fs.writeFile(
          path.join(publicDirectory, filename),
          Buffer.from(buffer)
        )
      })
    )

    console.log(
      `mdxts: copied files ${Object.keys(pathsToCopy).join(
        ', '
      )} to ${publicDirectory}`
    )
  }
}
