'use client'
import React from 'react'

import {
  isPackageManager,
  PACKAGE_MANAGER_STORAGE_KEY,
  type PackageManager,
} from '../../file-system/PackageManager.shared.ts'
import { CopyButtonClient } from '../CopyButton/CopyButtonClient.ts'

function getStoredPackageManager(): PackageManager | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const stored = window.localStorage?.getItem(PACKAGE_MANAGER_STORAGE_KEY)
    return isPackageManager(stored) ? stored : null
  } catch {
    return null
  }
}

/** @internal */
export function CopyCommand(
  props: React.ComponentProps<typeof CopyButtonClient>
) {
  return (
    <CopyButtonClient
      {...props}
      value={(event) => {
        const root = (event.currentTarget as HTMLElement).closest(
          '[data-command-group]'
        ) as HTMLElement | null

        if (!root) {
          return ''
        }

        const group = root.getAttribute('data-command-group')!
        const selectedTabElement = root.querySelector(
          '[role="tab"][aria-selected="true"]'
        ) as HTMLElement | null
        const stored = getStoredPackageManager()
        const selectedCommand = selectedTabElement?.dataset['command']
        const command: PackageManager = isPackageManager(selectedCommand)
          ? selectedCommand
          : (stored ?? 'npm')
        const tabPanelElement = document.querySelector(
          `[data-command-group="${group}"][role="tabpanel"][data-command="${command}"]`
        ) as HTMLElement | null

        return tabPanelElement?.getAttribute('data-command-tab-panel') ?? ''
      }}
    />
  )
}
