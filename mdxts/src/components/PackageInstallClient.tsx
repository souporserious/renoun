'use client'
import React, { useState } from 'react'

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
  const [selectedPackageManager, setSelectedPackageManager] = useState('npm')
  const command = allHighlightedCommands[selectedPackageManager]

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flexDirection: 'row' }}>
        {Object.keys(allHighlightedCommands).map((packageManager) => {
          const isSelected = selectedPackageManager === packageManager
          return (
            <button
              key={packageManager}
              onClick={() => setSelectedPackageManager(packageManager)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: isSelected ? '#000' : '#fff',
                color: isSelected ? '#fff' : '#000',
                border: '1px solid #000',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                margin: '0.5rem',
              }}
            >
              {packageManager}
            </button>
          )
        })}
      </div>
      {command}
    </div>
  )
}
