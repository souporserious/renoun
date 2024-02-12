import React from 'react'

import { CodeBlock } from './CodeBlock'
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
  style,
}: {
  packages: string[]
  style?: React.CSSProperties
}) {
  const allHighlightedCommands = Object.fromEntries(
    Object.entries(packageManagers).map(([command, install]) => [
      command,
      <CodeBlock
        allowCopy
        value={`${install} ${packages.join(' ')}`}
        language="shellscript"
      />,
    ])
  )

  return (
    <PackageInstallClient
      allHighlightedCommands={allHighlightedCommands}
      style={style}
    />
  )
}
