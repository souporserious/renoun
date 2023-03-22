import * as React from 'react'
import dynamic from 'next/dynamic'

const Editor = dynamic(async () => (await import('@mdxts/editor')).Editor, {
  ssr: false,
})

export function Live({
  children,
  code,
}: {
  children?: React.ReactNode
  code?: string
}) {
  return (
    <>
      {children}
      <Editor defaultValue={code} />
    </>
  )
}
