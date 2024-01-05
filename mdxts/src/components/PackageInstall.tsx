import React from 'react'

import { Code } from './Code'
import { PackageInstallClient } from './PackageInstallClient'

const packageManagers = {
  npm: 'npm install',
  pnpm: 'pnpm add',
  bun: 'bun add',
  yarn: 'yarn add',
}

/** * Renders install commands with a picker for each package manager. */
export async function PackageInstall({ packages }: { packages: string[] }) {
  const allHighlightedCommands = Object.fromEntries(
    Object.entries(packageManagers).map(([command, install]) => [
      command,
      <Code
        allowCopy
        value={`${install} ${packages.join(' ')}`}
        language="shell"
      />,
    ])
  )

  return (
    <PackageInstallClient allHighlightedCommands={allHighlightedCommands} />
  )
}
