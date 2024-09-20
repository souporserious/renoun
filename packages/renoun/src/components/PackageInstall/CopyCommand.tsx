'use client'
import React from 'react'

import { CopyButton } from '../CodeBlock/CopyButton.js'

/** @internal */
export function CopyCommand(props: React.ComponentProps<typeof CopyButton>) {
  return (
    <CopyButton
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
