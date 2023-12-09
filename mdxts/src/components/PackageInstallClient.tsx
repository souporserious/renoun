'use client'
import React, { useRef, useState, useEffect } from 'react'

const packageStyles = `
.PackageInstallButton {
  background-color: #fff;
  color: #000;
}
.PackageInstallButton.selected {
  background-color: #000;
  color: #fff;
}
`.trim()

function useLocalStorageState(key: string, defaultValue: string) {
  const [state, setState] = useState(defaultValue)
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
    } else {
      localStorage.setItem(key, state)
    }

    initialRender.current = false
  }, [state])

  return [state, setState] as const
}

/**
 * The client-side component for the PackageInstall component.
 * @private
 */
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
  const command = allHighlightedCommands[activePackageManager]

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <style>{packageStyles}</style>
      <div style={{ display: 'flex', flexDirection: 'row' }}>
        {Object.keys(allHighlightedCommands).map((packageManager) => {
          const isSelected = activePackageManager === packageManager
          return (
            <button
              key={packageManager}
              id={packageManager}
              onClick={() => setActivePackageManager(packageManager)}
              className={
                isSelected
                  ? 'PackageInstallButton selected'
                  : 'PackageInstallButton'
              }
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #000',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                margin: '0.5rem',
              }}
              suppressHydrationWarning
            >
              {packageManager}
            </button>
          )
        })}
        <script
          dangerouslySetInnerHTML={{
            __html: `localStorage.getItem('${stateKey}') && document.getElementById('${defaultPackageManager}').classList.remove('selected'); document.getElementById(localStorage.getItem('${stateKey}')).classList.add('selected')`,
          }}
        />
      </div>
      {command}
    </div>
  )
}
