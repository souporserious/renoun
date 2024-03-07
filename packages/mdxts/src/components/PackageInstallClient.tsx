'use client'
import React from 'react'

import { localStorageSignal } from '../signals/local-storage-signal'
import { useSignalValue } from '../hooks/use-signal-value'

const stateKey = 'package-manager'
const defaultPackageManager = 'npm'
const packageManager = localStorageSignal(stateKey, defaultPackageManager)

const packageStyles = `
.PackageInstallButton {
  font-size: var(--font-size-body-3);
  border: none;
  border-bottom: 1px solid transparent;
  color: #fff;
}
.PackageInstallButton.active {
  font-weight: 600;
  border-bottom: 1px solid #fff;
}
.PackageInstallCommand {
  display: none;
}
.PackageInstallCommand.active {
  display: contents;
}
`.trim()

const packageScript = `
const value = localStorage.getItem('${stateKey}');
if (value) {
  document.querySelectorAll('[data-storage-id^="package-manager-"]').forEach(element => element.classList.remove('active'));
  document.querySelectorAll(\`[data-storage-id="package-manager-\${value}"]\`).forEach(element => element.classList.add('active'));
  document.querySelectorAll(\`[data-storage-id="package-manager-\${value}-command"]\`).forEach(element => element.classList.add('active'));
}
`.trim()

/** The client-side component for the PackageInstall component. */
export function PackageInstallClient({
  allHighlightedCommands,
  style,
}: {
  allHighlightedCommands: Record<
    string,
    React.ReactElement<{ value: string; language: string }>
  >
  style?: React.CSSProperties
}) {
  const packageManagerValue = useSignalValue(packageManager)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          position: 'absolute',
          top: -3,
          left: 1,
          zIndex: 1,
        }}
      >
        {Object.keys(allHighlightedCommands).map((key) => {
          const isActive = packageManagerValue === key
          return (
            <button
              key={key}
              data-storage-id={`package-manager-${key}`}
              onClick={() => (packageManager.value = key)}
              className={
                isActive
                  ? 'PackageInstallButton active'
                  : 'PackageInstallButton'
              }
              style={{
                padding: '1rem',
                backgroundColor: 'transparent',
                cursor: 'pointer',
              }}
              suppressHydrationWarning
            >
              {key}
            </button>
          )
        })}
      </div>
      {Object.entries(allHighlightedCommands).map(([key, command]) => (
        <div
          key={key}
          data-storage-id={`package-manager-${key}-command`}
          className={
            packageManagerValue === key
              ? 'PackageInstallCommand active'
              : 'PackageInstallCommand'
          }
          suppressHydrationWarning
        >
          {command}
        </div>
      ))}
    </div>
  )
}

export function PackageStylesAndScript() {
  return (
    <>
      <style>{packageStyles}</style>
      <script dangerouslySetInnerHTML={{ __html: packageScript }} />
    </>
  )
}
