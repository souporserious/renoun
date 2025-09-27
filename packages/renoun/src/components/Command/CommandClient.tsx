'use client'
import React from 'react'

/**
 * Client script to set the package manager based on local storage if available.
 * @internal
 */
export function CommandClient() {
  return (
    <script ref={() => window.setPackageManager?.(null)}>
      window.setPackageManager?.(null)
    </script>
  )
}
