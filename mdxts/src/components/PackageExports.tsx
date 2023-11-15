import React from 'react'
import fs from 'fs'
import path from 'path'

// Remove the '/README.mdx' part to get the directory path
// This assumes that all keys end with '/README.mdx'
function normalizeKey(key: string, name: string) {
  return parsePath(key.replace(/\/README\.mdx$/, ''), name)
}

function parsePath(path: string, name: string) {
  return path === '.' ? name : path.replace(/^\.\//, `${name}/`)
}

export function PackageExports({
  name,
  context,
}: {
  name: string
  context: __WebpackModuleApi.RequireContext
}) {
  const readmeMap = context.keys().reduce((acc, key) => {
    const normalizedKey = normalizeKey(key, name)
    acc[normalizedKey] = context(key)
    return acc
  }, {})
  let exportsList = []

  try {
    const packageJsonPath = path.resolve(
      process.cwd(),
      'node_modules',
      name,
      'package.json'
    )
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

    if (packageJson.exports) {
      exportsList = Object.keys(packageJson.exports).map((exportPath) => {
        const parsedExportPath = parsePath(exportPath, name)
        return {
          exportPath: parsedExportPath,
          ...readmeMap[parsedExportPath],
        }
      })
    }
  } catch (error) {
    throw new Error(
      `Error reading package.json exports in PackageExports for ${name}`,
      { cause: error }
    )
  }

  return (
    <ul
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        gap: '1rem',
        listStyle: 'none',
      }}
    >
      {exportsList.map(({ exportPath, summary }, index) => (
        <li
          key={index}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '1rem',
          }}
        >
          <code>{exportPath}</code>
          {summary ? <p>{summary}</p> : null}
        </li>
      ))}
    </ul>
  )
}
