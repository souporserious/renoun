import React from 'react'

import { getResolvedContext } from '../CodeBlock/Context.tsx'
import { CopyButtonClient } from './CopyButtonClient.tsx'

/**
 * The props for the `CopyButton` component.
 * @internal
 */
export type CopyButtonProps = React.ComponentProps<typeof CopyButtonClient>

/**
 * Resolves a value from a `CodeBlock` ancestor or a `value` prop and renders a
 * copy button that copies that value to the clipboard.
 * @internal
 */
export async function CopyButton(props: CopyButtonProps) {
  let value = props.value

  if (value === undefined) {
    const context = await getResolvedContext()
    value = context.value
  }

  return <CopyButtonClient {...props} value={value} />
}
