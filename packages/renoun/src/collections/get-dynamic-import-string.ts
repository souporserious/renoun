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
  let relativeGlobPattern = relative(process.cwd(), absoluteGlobPattern)

  if (!relativeGlobPattern.startsWith('.')) {
    relativeGlobPattern = `./${relativeGlobPattern}`
  }

  const baseGlobPattern = globParent(relativeGlobPattern)

  return `(slug) => import(\`${baseGlobPattern}/\${slug}\`)`
}
