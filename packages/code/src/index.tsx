import * as React from 'react'
import { Code as BrightCode } from 'bright'

BrightCode.theme = JSON.parse(process.env.MDXTS_THEME)

export function Code({
  children,
  ...props
}: {
  children: React.ReactNode
} & any) {
  return (
    // @ts-expect-error
    <BrightCode lang="typescript" {...props}>
      {children}
    </BrightCode>
  )
}
