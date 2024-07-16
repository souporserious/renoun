import React from 'react'
import { ExportedTypes } from 'mdxts/components'

const sourceFileText = `
import React from 'react'

export function Button({
  children,
  onPress,
}: {
  children: React.ReactNode
} & PressProps) {
  const props = usePress({ onPress })
  return <button {...props}>{children}</button>
}

export type PressProps = {
  /** Function to call when the button is pressed. */
  onPress: () => void
}

export function usePress({ onPress }: PressProps) {
  return { onPress }
}
`

export function ValueProp() {
  return (
    <ExportedTypes filename="Button.tsx" value={sourceFileText}>
      {(declarations) => <pre>{JSON.stringify(declarations, null, 2)}</pre>}
    </ExportedTypes>
  )
}

export function SourceProp() {
  return (
    <ExportedTypes source="./MDXContent.tsx">
      {(declarations) =>
        declarations.map((exportedType) => {
          if (exportedType.kind === 'Component') {
            return (
              <div
                key={exportedType.name}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                <h2>{exportedType.name}</h2>
                <p>{exportedType.description}</p>
                <ul>
                  {/* {exportedType.properties.map((propType) => (
                    <li key={propType.name}>
                      <strong>{propType.name}:</strong> {propType.type}
                    </li>
                  ))} */}
                </ul>
              </div>
            )
          }

          // Implement remaining types for Interface, TypeAlias, etc.
          return null
        })
      }
    </ExportedTypes>
  )
}
