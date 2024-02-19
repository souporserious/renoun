import React from 'react'

import { APIReference } from './APIReference'
import { project } from './project'

project.createSourceFile(
  'usePress.ts',
  `
export type PressProps = {
  /** Function to call when the button is pressed. */
  onPress: () => void
}

export function usePress({ onPress }: PressProps) {
  return { onPress }
}
`
)

const sourceFileText = `
import React from 'react'
import { usePress, type PressProps } from './usePress'

export function Button({
  children,
  onPress,
}: {
  children: React.ReactNode
} & PressProps) {
  const props = usePress({ onPress })
  return <button {...props}>{children}</button>
}
`

export function Basic() {
  return <APIReference filename="Button.tsx" value={sourceFileText} />
}
