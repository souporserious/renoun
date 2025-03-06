import React from 'react'
import { CodeInline } from 'renoun/components'

export function Basic() {
  return (
    <p>
      In React,{' '}
      <CodeInline language="jsx">{`<span style={{ color: 'blue' }} />`}</CodeInline>{' '}
      changes the color of the text to blue.
    </p>
  )
}

export function AllowCopy() {
  return (
    <CodeInline allowCopy language="sh" paddingX="0.8em" paddingY="0.5em">
      npx create-renoun
    </CodeInline>
  )
}
