import fs from 'node:fs/promises'
import path from 'node:path'
import { builtinModules } from 'node:module'
import { rollup } from 'rollup'
import dts from 'rollup-plugin-dts'
import ts from 'typescript'

/* TODO: this is inefficient, the ata utility should only be instantiated once. */
async function fetchTypes(
  name: string[]
): Promise<{ code: string; path: string }[]> {
  const { setupTypeAcquisition } = await import('@typescript/ata')
  let types: { code: string; path: string }[] = []

  return new Promise((resolve) => {
    const ata = setupTypeAcquisition({
      projectName: 'mdxts',
      typescript: ts,
      logger: console,
      fetcher: async (input) => {
        const { default: fetch } = await import('node-fetch')
        return fetch(input as any) as any
      },
      delegate: {
        receivedFile: (code: string, path: string) => {
          types = [...types, { code, path }]
        },
        errorMessage(userFacingMessage, error) {
          throw new Error(userFacingMessage, { cause: error })
        },
        finished: () => {
          resolve(
            types.map(({ code, path }) => ({
              code,
              path: path.replace('@types/', ''),
            }))
          )
        },
      },
    })

    /*
     * ATA expects a list of imports from a source file to fetch types for,
     * so we simply provide a list of imports for each package.
     */
    ata(name.map((name) => `import ${name} from "${name}"`).join('\n'))
  })
}

async function getPackageJson(packagePath) {
  const packageJsonContent = await fs.readFile(packagePath, 'utf-8')
  return JSON.parse(packageJsonContent)
}

function getAllDependencies(packageJson) {
  return Object.keys(packageJson.dependencies ?? {}).concat(
    Object.keys(packageJson.peerDependencies ?? {})
  )
}

async function findTypesPathFromTypeVersions(packageJson, packageName) {
  const rootPackageName = getRootPackageName(packageName)
  const submoduleName = packageName.split('/').slice(1).join('/')

  if (!packageJson.typesVersions) return null

  const typeVersionsField = packageJson.typesVersions['*']

  if (!typeVersionsField) return null

  const typesPathsFromTypeVersions = typeVersionsField[submoduleName]

  if (!typesPathsFromTypeVersions) return null

  for (const candidatePath of typesPathsFromTypeVersions) {
    try {
      const typesPath = path.resolve(
        process.cwd(),
        'node_modules',
        rootPackageName,
        candidatePath
      )

      await fs.access(typesPath)
      return typesPath
    } catch {
      // Ignore and continue with the next candidate path
    }
  }

  return null
}

async function findParentNodeModulesPath(currentPath, packageName) {
  const nodeModulesPath = path.resolve(currentPath, 'node_modules', packageName)

  try {
    await fs.access(nodeModulesPath)
    return nodeModulesPath
  } catch {
    const parentPath = path.dirname(currentPath)
    // We have reached the root directory
    if (parentPath === currentPath) {
      return null
    }
    return findParentNodeModulesPath(parentPath, packageName)
  }
}

async function findTypesPath(packageJson, packageName) {
  const typesField = packageJson.types || packageJson.typings
  const isSubmodule = packageName.includes('/')

  if (!isSubmodule && typesField) {
    return path.resolve(process.cwd(), 'node_modules', packageName, typesField)
  }

  if (isSubmodule) {
    const typesPath = await findTypesPathFromTypeVersions(
      packageJson,
      packageName
    )

    if (typesPath) {
      return typesPath
    }
  }

  const parentNodeModulesPath = await findParentNodeModulesPath(
    process.cwd(),
    `@types/${packageName}`
  )

  if (!parentNodeModulesPath) return null

  return path.resolve(parentNodeModulesPath, 'index.d.ts')
}

/** Parses the root package name from a nested package name. */
function getRootPackageName(packageName: string) {
  const isOrg = packageName.startsWith('@')

  if (isOrg) {
    return packageName.split('/').slice(0, 2).join('/')
  }

  return packageName.split('/').shift()
}

/** Fetches the types for a locally installed NPM package. */
export async function getTypeDeclarations(packageName) {
  const rootPackageName = getRootPackageName(packageName)
  const packageJsonPath = path.resolve(
    process.cwd(),
    'node_modules',
    rootPackageName,
    'package.json'
  )

  try {
    const packageJson = await getPackageJson(packageJsonPath)
    const allDependencies = getAllDependencies(packageJson)
    const typesPath = await findTypesPath(packageJson, packageName)

    // use ATA when dealing with @types since rollup is not reliable
    if (typesPath.includes('@types/')) {
      const packageTypes = await fetchTypes([packageName])
      return packageTypes
    }

    try {
      const bundle = await rollup({
        input: path.resolve('./node_modules/', packageName, typesPath),
        plugins: [dts({ respectExternal: true })],
        external: (id) =>
          allDependencies
            .concat(
              builtinModules,
              builtinModules.map((moduleName) => `node:${moduleName}`)
            )
            .includes(id),
      })
      const result = await bundle.generate({})

      return [
        {
          code: result.output[0].code,
          path: `/node_modules/${packageName}/index.d.ts`,
        },
      ]
    } catch (error) {
      console.error(`mdxts: Could not find types for "${packageName}"`, error)
    }
  } catch (error) {
    console.error(
      `mdxts: Could not find package.json for "${packageName}"`,
      error
    )
  }

  return []
}
