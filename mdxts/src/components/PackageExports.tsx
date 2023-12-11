import React from 'react'
import fs from 'fs'
import path from 'path'
import { redirect } from 'next/navigation'
import { getEditorPath } from '../utils'

// Remove the '/README.mdx' part to get the directory path
// This assumes that all keys end with '/README.mdx'
function normalizeKey(key: string, name: string) {
  return parsePath(key.replace(/\/README\.mdx$/, ''), name)
}

function parsePath(path: string, name: string) {
  return path === '.' ? name : path.replace(/^\.\//, `${name}/`)
}

/** Renders a list of exports from a package. */
export async function PackageExports({
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
            module: readmeModule,
            exportPath: parsedExportPath,
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

  const resolvedExportsList = await Promise.all(
    exportsList.map(async ({ module, ...rest }) => ({
      ...rest,
      module: module instanceof Promise ? await module : module,
    }))
  )

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
      {resolvedExportsList.map(
        ({ module, exportPath, sourcePath, editorPath }, index) => {
          if (module === undefined) {
            if (process.env.NODE_ENV === 'development') {
              return (
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
                  <form
                    action={async function createReadme() {
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
                    <button
                      style={{
                        letterSpacing: '0.015em',
                        fontWeight: 600,
                        padding: '0.5rem 0.8rem',
                        border: '1px solid #0479df',
                        borderRadius: '8px',
                        background: '#1871be',
                        color: 'white',
                      }}
                    >
                      Create README
                    </button>
                  </form>
                </li>
              )
            }

            return (
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
              </li>
            )
          }

          const { summary } = module

          return (
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
              {summary}
            </li>
          )
        }
      )}
    </ul>
  )
}
