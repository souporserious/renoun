export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const

export type PackageManagerName = (typeof PACKAGE_MANAGERS)[number]

/**
 * Browser-safe package manager type (string union).
 *
 * Note: the Node implementation exports a `PackageManager` class from
 * `./PackageManager.ts`.
 */
export type PackageManager = PackageManagerName

export const PACKAGE_MANAGER_STORAGE_KEY = 'package-manager' as const

export function isPackageManagerName(
  value: unknown
): value is PackageManagerName {
  return (
    typeof value === 'string' &&
    (PACKAGE_MANAGERS as readonly string[]).includes(value)
  )
}

export function isPackageManager(value: unknown): value is PackageManager {
  return isPackageManagerName(value)
}
