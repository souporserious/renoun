'use client'
import React from 'react'

import { CopyButtonClient } from '../CopyButton/CopyButtonClient.js'

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
        const stored =
          typeof window !== 'undefined' && window.localStorage
            ? window.localStorage.getItem('package-manager')
            : null
        const command =
          selectedTabElement?.dataset['command'] ?? stored ?? 'npm'
        const tabPanelElement = document.querySelector(
          `[data-command-group="${group}"][role="tabpanel"][data-command="${command}"]`
        ) as HTMLElement | null

        return tabPanelElement?.getAttribute('data-command-tab-panel') ?? ''
      }}
    />
  )
}
