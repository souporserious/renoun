'use client'
import React, { useRef, useState, useEffect } from 'react'

const packageStyles = `
.PackageInstallButton {
  background-color: var(--color-surface-2);
  color: #fff;
}
.PackageInstallButton.active {
  background-color: #fff;
  color: var(--color-surface-2);
}
.Command {
  display: none;
}
.Command.active {
  display: contents;
}
`.trim()

function useLocalStorageState(key: string, defaultValue?: string) {
  const [state, setState] = useState(defaultValue)
  const [isLoading, setIsLoading] = useState(true)
  const initialRender = useRef(true)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (initialRender.current) {
      const saved = localStorage.getItem(key)
      if (saved) {
        setState(saved)
      }
      setIsLoading(false)
    } else if (state) {
      localStorage.setItem(key, state)
    }

    initialRender.current = false
  }, [state])

  return [state, setState, isLoading] as const
}

/** The client-side component for the PackageInstall component. */
export function PackageInstallClient({
  allHighlightedCommands,
}: {
  allHighlightedCommands: Record<
    string,
    React.ReactElement<{ value: string; language: string }>
  >
}) {
  const stateKey = 'package-manager'
  const defaultPackageManager = 'npm'
  const [activePackageManager, setActivePackageManager] = useLocalStorageState(
    stateKey,
    defaultPackageManager
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <style>{packageStyles}</style>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          marginBottom: '0.25rem',
        }}
      >
        {Object.keys(allHighlightedCommands).map((packageManager) => {
          const isActive = activePackageManager === packageManager
          return (
            <button
              key={packageManager}
              id={`package-manager-${packageManager}`}
              onClick={() => setActivePackageManager(packageManager)}
              className={
                isActive
                  ? 'PackageInstallButton active'
                  : 'PackageInstallButton'
              }
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #000',
                borderRadius: '0.5rem',
                cursor: 'pointer',
              }}
              suppressHydrationWarning
            >
              {packageManager}
            </button>
          )
        })}
      </div>
      {Object.entries(allHighlightedCommands).map(([key, command]) => (
        <div
          key={key}
          id={`package-manager-${key}-command`}
          className={
            activePackageManager === key ? 'Command active' : 'Command'
          }
        >
          {command}
        </div>
      ))}
      <script
        dangerouslySetInnerHTML={{
          __html: `localStorage.getItem('${stateKey}') && document.getElementById('package-manager-${defaultPackageManager}').classList.remove('active'); document.getElementById(\`package-manager-$\{localStorage.getItem('${stateKey}')\}\`).classList.add('active'); localStorage.getItem('${stateKey}') && document.getElementById('package-manager-${defaultPackageManager}-command').classList.remove('active'); document.getElementById(\`package-manager-$\{localStorage.getItem('${stateKey}')\}-command\`).classList.add('active')`,
        }}
      />
    </div>
  )
}
