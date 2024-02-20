import React, { Fragment } from 'react'

import { ExportedTypes } from './ExportedTypes'

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

export function Basic() {
  return <ExportedTypes filename="Button.tsx" value={sourceFileText} />
}

export function Custom() {
  return (
    <ExportedTypes source="./MDXContent.tsx">
      {(declarations) =>
        declarations.map((declaration) => (
          <div
            key={declaration.name}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <h2>{declaration.name}</h2>
            <p>{declaration.description}</p>
            <ul>
              {declaration.types.map((type) => (
                <Fragment key={type.text}>
                  {type.properties?.length
                    ? type.properties.map((property) => (
                        <li key={property.name}>
                          {property.name}: {property.text}
                        </li>
                      ))
                    : null}
                </Fragment>
              ))}
            </ul>
          </div>
        ))
      }
    </ExportedTypes>
  )
}
