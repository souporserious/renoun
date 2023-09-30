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
              path: `file://${path.replace('@types/', '')}`,
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

async function findTypesPathFromTypeVersions(
  packageJson,
  parentPackage,
  submodule
) {
  if (!packageJson.typesVersions) return null

  const typeVersionsField = packageJson.typesVersions['*']

  if (!typeVersionsField) return null

  const typesPathsFromTypeVersions = typeVersionsField[submodule]

  if (!typesPathsFromTypeVersions) return null

  for (const candidatePath of typesPathsFromTypeVersions) {
    try {
      const typesPath = path.resolve(
        process.cwd(),
        'node_modules',
        parentPackage,
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
    if (parentPath === currentPath) return null // We have reached the root directory
    return findParentNodeModulesPath(parentPath, packageName)
  }
}

async function findTypesPath(packageJson, parentPackage, submodule) {
  const typesField = packageJson.types || packageJson.typings

  if (!submodule && typesField) {
    return path.resolve(
      process.cwd(),
      'node_modules',
      parentPackage,
      typesField
    )
  }

  if (submodule) {
    const typesPath = await findTypesPathFromTypeVersions(
      packageJson,
      parentPackage,
      submodule
    )
    if (typesPath) return typesPath
  }

  const parentNodeModulesPath = await findParentNodeModulesPath(
    process.cwd(),
    `@types/${parentPackage}`
  )

  if (!parentNodeModulesPath) return null

  return path.resolve(parentNodeModulesPath, 'index.d.ts')
}

/** Fetches the types for a locally installed NPM package. */
export async function getTypeDeclarations(packageName) {
  const [orgOrParent, parentPackageOrSubmodule, submoduleCandidate] =
    packageName.split('/')
  const isOrgPackage = orgOrParent.startsWith('@')
  const parentPackage = isOrgPackage
    ? `${orgOrParent}/${parentPackageOrSubmodule}`
    : orgOrParent
  const submodule = isOrgPackage ? submoduleCandidate : parentPackageOrSubmodule
  const parentPackagePath = path.resolve(
    process.cwd(),
    'node_modules',
    parentPackage,
    'package.json'
  )

  try {
    const packageJson = await getPackageJson(parentPackagePath)
    const allDependencies = getAllDependencies(packageJson)
    const typesPath = await findTypesPath(packageJson, parentPackage, submodule)

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
          path: `file:///node_modules/${packageName}/index.d.ts`,
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
