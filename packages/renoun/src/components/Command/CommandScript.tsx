import React from 'react'

import { Script } from '../Script.ts'

/**
 * The package manager.
 * @internal
 */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

/**
 * The props for the `CommandScript` component.
 * @internal
 */
export interface CommandScriptProps {
  /** Override the default package manager used when none is stored. */
  defaultPackageManager?: PackageManager

  /** The nonce to use for the script tag. */
  nonce?: string
}

/**
 * Global script for the `Command` component. Defines a `window.setPackageManager`
 * method that wires up keyboard and click handlers, and applies a selection state.
 * @internal
 */
export function CommandScript({
  defaultPackageManager,
  nonce,
}: CommandScriptProps) {
  return (
    <Script defaultPackageManager={defaultPackageManager} nonce={nonce}>
      {import('./script.ts')}
    </Script>
  )
}
