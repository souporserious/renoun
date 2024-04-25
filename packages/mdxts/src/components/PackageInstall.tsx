import React from 'react'

import { getTheme } from '../index'
import { CopyButton } from './CopyButton'
import { CodeBlock } from './CodeBlock/CodeBlock'
import { Tokens } from './CodeBlock/Tokens'

const stateKey = 'package-manager'
const defaultPackageManager = 'npm'
const packageManagers = {
  npm: 'npm install',
  pnpm: 'pnpm add',
  bun: 'bun add',
  yarn: 'yarn add',
}

/** Renders a package install command with a variant for each package manager. */
export async function PackageInstall({
  packages,
  style,
}: {
  packages: string[]
  style?: {
    container?: React.CSSProperties
    tabs?: React.CSSProperties
    tabPanels?: React.CSSProperties
  }
}) {
  const theme = getTheme()
  const tabs = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        boxShadow: `inset 0 -1px 0 0 ${theme.panel.border}70`,
        ...style?.tabs,
      }}
    >
      {Object.keys(packageManagers).map((packageManager) => (
        <button
          key={packageManager}
          data-storage-id={`package-manager-${packageManager}`}
          className="PackageInstallTab"
          style={{
            fontSize: 'inherit',
            padding: '0.8em',
            backgroundColor: 'transparent',
            cursor: 'pointer',
          }}
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
        className="PackageInstallTabPanel"
        suppressHydrationWarning
        style={style?.tabPanels}
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
        boxShadow: `0 0 0 1px ${theme.panel.border}70`,
        borderRadius: 5,
        ...style?.container,
      }}
    >
      {tabs}
      {tabPanels}
    </div>
  )
}

const packageStyles = `
@layer mdxts {
  .PackageInstallTab {
    width: 5em;
    border: none;
    border-bottom: 1px solid transparent;
    color: #fff;
  }
  .PackageInstallTab.active {
    font-weight: 600;
    border-bottom: 1px solid #fff;
  }
  .PackageInstallCopyButton {
    margin-right: 1rch !important;
    margin-left: auto !important;
  }
  .PackageInstallTabPanel {
    line-height: 1.4;
    padding: 1ch;
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
}
`.trim()

const packageScript = `
function setPackageManager(packageManager) {
  document.querySelectorAll('[data-storage-id^="package-manager-"]').forEach(element =>
    element.classList.toggle('active', element.dataset.storageId === \`package-manager-\${packageManager}\`)
  );
}
setPackageManager(localStorage.getItem('${stateKey}') ?? '${defaultPackageManager}');
document.addEventListener('click', event => {
  if (event.target.classList.contains('PackageInstallTab')) {
    const command = event.target.dataset.storageId.replace('package-manager-', '');
    localStorage.setItem('${stateKey}', command);
    setPackageManager(command);
  }
});
`.trim()

export function PackageInstallStylesAndScript() {
  return (
    <>
      <style>{packageStyles}</style>
      <script dangerouslySetInnerHTML={{ __html: packageScript }} />
    </>
  )
}
