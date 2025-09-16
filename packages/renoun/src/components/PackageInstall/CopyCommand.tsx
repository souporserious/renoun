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
        const packageInstallElement = event.currentTarget.closest(
          '[data-package-install]'
        )!
        const tabPanelElement = packageInstallElement.querySelector(
          '[data-package-install-tab-panel].selected'
        )!
        const command = tabPanelElement.getAttribute(
          'data-package-install-tab-panel'
        )!
        return command
      }}
    />
  )
}
