'use client'
import React, { useEffect } from 'react'

/**
 * Client script to set the package manager based on local storage if available.
 * @internal
 */
export function PackageInstallClient() {
  useEffect(() => {
    ;(window as any).setPackageManager()
  }, [])

  return <script>window.setPackageManager()</script>
}
