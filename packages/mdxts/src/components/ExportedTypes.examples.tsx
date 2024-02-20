import React from 'react'

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
