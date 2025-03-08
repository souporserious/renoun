import React from 'react'

import { getContext } from '../../utils/context'
import { Context } from './Context'
import { CopyButtonClient } from './CopyButtonClient'

export async function CopyButton(
  props: React.ComponentProps<typeof CopyButtonClient>
) {
  const context = getContext(Context)

  if (context) {
    await context.resolvers.promise
  }

  return <CopyButtonClient {...props} value={props.value ?? context?.value} />
}
