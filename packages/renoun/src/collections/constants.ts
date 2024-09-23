import { join } from 'node:path'

import { getClosestPackageJsonOrThrow } from '../utils/get-closest-package-json.js'

const packageJsonMeta = getClosestPackageJsonOrThrow()

/** @internal */
export const WORKSPACE_IS_MODULE = packageJsonMeta.packageJson.type === 'module'

/** @internal */
export const PACKAGE_NAME = 'renoun'

/** @internal */
export const PACKAGE_DIRECTORY = '.renoun'

/** @internal */
export const PACKAGE_IMPORT_DIRECTORY = WORKSPACE_IS_MODULE
  ? '#renoun'
  : 'renoun'

/** @internal */
export const PACKAGE_IMPORT_PATTERN = join(PACKAGE_IMPORT_DIRECTORY, '*')

/** @internal */
export const PACKAGE_FILE_PATTERN = join(PACKAGE_DIRECTORY, '*.ts')

/** @internal */
export const COLLECTIONS_IMPORT_NAME = 'renoun/core'

/** @internal */
export const COLLECTIONS_FILENAME = 'collections.ts'

/** @internal */
export const COLLECTIONS_FILE_PATH = join(
  PACKAGE_DIRECTORY,
  COLLECTIONS_FILENAME
)
