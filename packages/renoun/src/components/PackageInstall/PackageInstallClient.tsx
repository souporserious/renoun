'use client'
import React from 'react'

/**
 * Client script to set the package manager based on local storage if available.
 * @internal
 */
export function PackageInstallClient() {
  return (
    <script ref={() => window.setPackageManager?.()}>
      window.setPackageManager()
    </script>
  )
}
