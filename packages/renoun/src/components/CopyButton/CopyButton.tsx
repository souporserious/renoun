import React from 'react'

import { getResolvedContext } from '../CodeBlock/Context.js'
import { CopyButtonClient } from './CopyButtonClient.js'

/**
 * Resolves a value from a `CodeBlock` ancestor or a `value` prop and renders a
 * copy button that copies that value to the clipboard.
 * @internal
 */
export async function CopyButton(
  props: React.ComponentProps<typeof CopyButtonClient>
) {
  let value = props.value

  if (value === undefined) {
    const context = await getResolvedContext()
    value = context.value
  }

  return <CopyButtonClient {...props} value={value} />
}
