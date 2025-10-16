import React from 'react'

import { Script } from '../Script.js'

/**
 * A script that sets the theme based on local storage before the page renders
 * and subscribes to system theme changes.
 * @internal
 */
export function ThemeScript({ nonce }: { nonce?: string }) {
  return <Script nonce={nonce}>{import('./script.js')}</Script>
}
