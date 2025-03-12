import React from 'react'

import { getResolvedContext } from './Context'
import { CopyButtonClient } from './CopyButtonClient'

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
