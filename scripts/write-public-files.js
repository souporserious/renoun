const { existsSync } = require('fs')
const fs = require('fs/promises')
const path = require('path')
const fetch = require('node-fetch')

const publicDirectory = path.join(__dirname, '../site/public')

const pathsToCopy = {
  'onigasm.wasm': `https://unpkg.com/onigasm@2.2.5/lib/onigasm.wasm`,
  'javascript.tmLanguage.json': `https://unpkg.com/shiki@0.12.1/languages/javascript.tmLanguage.json`,
  'jsx.tmLanguage.json': `https://unpkg.com/shiki@0.12.1/languages/jsx.tmLanguage.json`,
  'typescript.tmLanguage.json': `https://unpkg.com/shiki@0.12.1/languages/typescript.tmLanguage.json`,
  'tsx.tmLanguage.json': `https://unpkg.com/shiki@0.12.1/languages/tsx.tmLanguage.json`,
}

// Create public directory
fs.stat(publicDirectory).catch(() => fs.mkdir(publicDirectory))

if (
  !Object.keys(pathsToCopy).some((filename) =>
    existsSync(path.join(publicDirectory, filename))
  )
) {
  // Copy files
  Promise.all(
    Object.entries(pathsToCopy).map(async ([filename, url]) => {
      const data = await fetch.default(url)
      const buffer = await data.arrayBuffer()

      await fs.writeFile(
        path.join(publicDirectory, filename),
        Buffer.from(buffer)
      )
    })
  ).then(() => {
    console.log(
      `Copied files ${Object.keys(pathsToCopy).join(
        ', '
      )} to ${publicDirectory}`
    )
  })
}
