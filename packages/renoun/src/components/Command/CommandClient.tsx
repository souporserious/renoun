'use client'
import React from 'react'

declare global {
  interface Window {
    setPackageManager: undefined | ((packageManager?: string) => void)
  }
}

/**
 * Client script to set the package manager based on local storage if available.
 * @internal
 */
export function CommandClient() {
  return (
    <script ref={() => window.setPackageManager?.()}>
      window.setPackageManager()
    </script>
  )
}
