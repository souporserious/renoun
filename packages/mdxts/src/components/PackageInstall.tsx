import React from 'react'

import { getThemeColors } from '../index'
import { CopyButton } from './CodeBlock/CopyButton'
import { CodeBlock } from './CodeBlock/CodeBlock'
import { Tokens } from './CodeBlock/Tokens'
import { PackageInstallClient } from './PackageInstallClient'

const stateKey = 'package-manager'
const defaultPackageManager = 'npm'
const packageManagers = {
  npm: 'npm install',
  pnpm: 'pnpm add',
  bun: 'bun add',
  yarn: 'yarn add',
}

/**
 * Renders a package install command with a variant for each package manager.
 * @internal
 */
export async function PackageInstall({
  packages,
  style,
}: {
  packages: string[]
  style?: {
    container?: React.CSSProperties
    tabs?: React.CSSProperties
    tabItem?: React.CSSProperties
    tabPanels?: React.CSSProperties
    codeBlock?: React.CSSProperties
  }
}) {
  const theme = await getThemeColors()
  const tabs = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        boxShadow: `inset 0 -1px 0 0 ${theme.panel.border}`,
        ...style?.tabs,
      }}
    >
      {Object.keys(packageManagers).map((packageManager) => (
        <button
          key={packageManager}
          data-storage-id={`package-manager-${packageManager}`}
          className={
            packageManager === defaultPackageManager
              ? 'PackageInstallTab active'
              : 'PackageInstallTab'
          }
          style={style?.tabItem}
          suppressHydrationWarning
        >
          {packageManager}
        </button>
      ))}
      {Object.entries(packageManagers).map(([packageManager, install]) => (
        <CopyButton
          data-storage-id={`package-manager-${packageManager}`}
          className="PackageInstallCopyButton"
          value={`${install} ${packages.join(' ')}`}
          suppressHydrationWarning
        />
      ))}
    </div>
  )
  const tabPanels = Object.entries(packageManagers).map(
    ([packageManager, install]) => (
      <pre
        key={packageManager}
        data-storage-id={`package-manager-${packageManager}`}
        className={
          packageManager === defaultPackageManager
            ? 'PackageInstallTabPanel active'
            : 'PackageInstallTabPanel'
        }
        suppressHydrationWarning
        style={{
          lineHeight: '1.4',
          padding: '1ch',
          ...style?.tabPanels,
        }}
      >
        <CodeBlock value={`${install} ${packages.join(' ')}`} language="sh">
          <Tokens />
        </CodeBlock>
      </pre>
    )
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.background,
        color: theme.foreground,
        boxShadow: `0 0 0 1px ${theme.panel.border}`,
        borderRadius: 5,
        ...style?.container,
      }}
    >
      {tabs}
      {tabPanels}
      <PackageInstallClient />
    </div>
  )
}

const packageStyles = `
.PackageInstallTab {
  font-size: inherit;
  width: 5em;
  padding: 0.8em;
  border: none;
  border-bottom: 1px solid transparent;
  background-color: transparent;
  cursor: pointer;
}
.PackageInstallTab.active {
  font-weight: 600;
  border-bottom: 1px solid #fff;
  color: #fff;
}
.PackageInstallCopyButton {
  margin-right: 1rch !important;
  margin-left: auto !important;
}
.PackageInstallTabPanel {
  overflow: auto;
}
.PackageInstallCopyButton,
.PackageInstallTabPanel {
  display: none !important;
}
.PackageInstallCopyButton.active,
.PackageInstallTabPanel.active {
  display: initial !important;
}
`.trim()

const packageScript = `
window.setPackageManager = (packageManager) => {
  if (!packageManager) {
    packageManager = localStorage.getItem('${stateKey}') ?? '${defaultPackageManager}'
  }
  document.querySelectorAll('[data-storage-id^="package-manager-"]').forEach(element =>
    element.classList.toggle('active', element.dataset.storageId === \`package-manager-\${packageManager}\`)
  );
}
document.addEventListener('click', event => {
  if (event.target.classList.contains('PackageInstallTab')) {
    const command = event.target.dataset.storageId.replace('package-manager-', '');
    localStorage.setItem('${stateKey}', command);
    window.setPackageManager(command);
  }
});
`.trim()

/**
 * Renders a package install command with a variant for each package manager.
 * @internal
 */
export function PackageInstallStylesAndScript() {
  return (
    <>
      <style>{packageStyles}</style>
      <script dangerouslySetInnerHTML={{ __html: packageScript }} />
    </>
  )
}
