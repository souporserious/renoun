import React from 'react'
import fs from 'fs'
import path from 'path'
import { getEditorPath } from '../utils'
import { redirect } from 'next/navigation'

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
  let exportsList = []

  try {
    const packageDirectoryPath = path.resolve(
      process.cwd(),
      'node_modules',
      name
    )
    const packageJsonPath = path.join(packageDirectoryPath, 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    const tsconfigPath = path.join(packageDirectoryPath, 'tsconfig.json')
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'))
    const readmeModules = context.keys().reduce((allModules, key) => {
      console.log(key)
      const normalizedKey = normalizeKey(key, name)
      allModules[normalizedKey] = context(key)
      return allModules
    }, {})
    if (packageJson.exports) {
      exportsList = Object.keys(packageJson.exports).map(
        (exportPath: string) => {
          // TODO: the README source path should be inferred from the bundler like tsc/swc/tsup/etc.
          const sourcePath = path.join(
            packageDirectoryPath,
            tsconfig.compilerOptions.rootDir,
            ...(name === exportPath ? [] : [exportPath]),
            'README.mdx'
          )
          const parsedExportPath = parsePath(exportPath, name)
          const readmeModule = readmeModules[parsedExportPath]

          return {
            exportPath: parsedExportPath,
            ...readmeModule,
            ...(process.env.NODE_ENV === 'development'
              ? { sourcePath, editorPath: getEditorPath({ path: sourcePath }) }
              : {}),
          }
        }
      )
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
      {exportsList.map(
        ({ exportPath, sourcePath, editorPath, summary }, index) => (
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
            {summary ? (
              <p>{summary}</p>
            ) : process.env.NODE_ENV === 'development' ? (
              <form>
                <button
                  formAction={async function createReadme() {
                    'use server'
                    // create the README file if it doesn't exist
                    if (!fs.existsSync(sourcePath)) {
                      fs.writeFileSync(
                        sourcePath,
                        `# ${exportPath}\n\nThis is the README for the ${exportPath} export from the ${name} package.`
                      )
                    }

                    // open the README file in the editor
                    redirect(editorPath)
                  }}
                >
                  Create README
                </button>
              </form>
            ) : null}
          </li>
        )
      )}
    </ul>
  )
}
