import React from 'react'
import { type Theme } from './highlighter'
import { Code } from './Code'
import { PackageInstallClient } from './PackageInstallClient'

const packageManagers = {
  npm: 'npm install',
  pnpm: 'pnpm add',
  bun: 'bun add',
  yarn: 'yarn add',
}

/** * Renders install commands with a picker for each package manager. */
export async function PackageInstall({
  packages,
  theme,
}: {
  packages: string[]
  theme?: Theme
}) {
  const allHighlightedCommands = Object.fromEntries(
    Object.entries(packageManagers).map(([command, install]) => [
      command,
      <Code
        value={`${install} ${packages.join(' ')}`}
        language="shell"
        theme={theme}
      />,
    ])
  )

  return (
    <PackageInstallClient allHighlightedCommands={allHighlightedCommands} />
  )
}
