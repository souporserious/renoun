import React from 'react'

import { Script } from '../Script.js'

/**
 * A script that sets the theme based on local storage before the page renders
 * and subscribes to system theme changes.
 * @internal
 */
export function ThemeScript({
  nonce,
  storageKey,
}: {
  nonce?: string
  /** LocalStorage key to use for storing the selected color mode. */
  storageKey?: string
}) {
  return (
    <Script nonce={nonce} storageKey={storageKey}>
      {import('./script.js')}
    </Script>
  )
}
