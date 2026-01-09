import React from 'react'

import { type PackageManager } from '../../file-system/PackageManager.shared.ts'
import { Script } from '../Script.ts'

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
