import fs from 'node:fs/promises'
import path from 'node:path'
import { builtinModules } from 'node:module'
import { rollup } from 'rollup'
import dts from 'rollup-plugin-dts'

async function getPackageJson(
  packagePath: string
): Promise<Record<string, any>> {
  try {
    const packageJsonContent = await fs.readFile(packagePath, 'utf-8')
    return JSON.parse(packageJsonContent)
  } catch (error) {
    throw new Error(`mdxts: Could not read package.json for "${packagePath}"`, {
      cause: error,
    })
  }
}

function getAllDependencies(packageJson: Record<string, any>): string[] {
  return Object.keys(packageJson.dependencies ?? {}).concat(
    Object.keys(packageJson.peerDependencies ?? {})
  )
}

async function findTypesPathFromTypeVersions(
  packageJson: Record<string, any>,
  packageName: string
): Promise<string | null> {
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

async function findParentNodeModulesPath(
  currentPath: string,
  packageName: string
): Promise<string | null> {
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

async function findTypesPath(
  packageJson: Record<string, any>,
  packageName: string
): Promise<string | null> {
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

  if (!parentNodeModulesPath) {
    return null
  }

  return path.resolve(parentNodeModulesPath, 'index.d.ts')
}

/** Parses the root package name from a nested package name. */
function getRootPackageName(packageName: string): string {
  const isOrg = packageName.startsWith('@')

  if (isOrg) {
    return packageName.split('/').slice(0, 2).join('/')
  }

  const root = packageName.split('/').shift()

  if (!root) {
    throw new Error(
      `mdxts: Could not parse root package name from "${packageName}"`
    )
  }

  return root
}

/** Fetches the types for a locally installed NPM package. */
export async function getTypeDeclarations(packageName: string) {
  const rootPackageName = getRootPackageName(packageName)
  const packageJsonPath = path.resolve(
    process.cwd(),
    'node_modules',
    rootPackageName,
    'package.json'
  )
  const packageJson = await getPackageJson(packageJsonPath)
  const typesPath = await findTypesPath(packageJson, packageName)

  if (typesPath === null) {
    throw new Error(
      `mdxts(createMdxtsPlugin > types): Could not find types for "${packageName}", make sure the package is either defined in the package.json and is available to the current workspace or is published to NPM.`
    )
  }

  const allDependencies = getAllDependencies(packageJson)

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
}
