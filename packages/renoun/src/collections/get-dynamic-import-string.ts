import { relative } from 'node:path'
import globParent from 'glob-parent'

import { getAbsoluteGlobPattern } from './get-absolute-glob-pattern.js'

export async function getDynamicImportString(
  filePattern: string,
  tsConfigFilePath: string = 'tsconfig.json'
) {
  const absoluteGlobPattern = await getAbsoluteGlobPattern(
    filePattern,
    tsConfigFilePath
  )
  const relativeGlobPattern = relative(process.cwd(), absoluteGlobPattern)
  const baseGlobPattern = globParent(relativeGlobPattern)

  return `(slug) => import(\`${baseGlobPattern}/\${slug}\`)`
}
