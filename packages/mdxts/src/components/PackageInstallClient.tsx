'use client'
import React, { useRef, useState, useEffect } from 'react'

const packageStyles = `
.PackageInstallButton {
  font-size: 1rem;
  border: none;
  border-bottom: 1px solid transparent;
  color: #fff;
}
.PackageInstallButton.active {
  font-weight: 600;
  border-bottom: 1px solid #fff;
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
  style,
}: {
  allHighlightedCommands: Record<
    string,
    React.ReactElement<{ value: string; language: string }>
  >
  style?: React.CSSProperties
}) {
  const stateKey = 'package-manager'
  const defaultPackageManager = 'npm'
  const [activePackageManager, setActivePackageManager] = useLocalStorageState(
    stateKey,
    defaultPackageManager
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        ...style,
      }}
    >
      <style>{packageStyles}</style>
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
                padding: '1rem',
                backgroundColor: 'transparent',
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
