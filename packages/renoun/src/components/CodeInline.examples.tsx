import React from 'react'
import { CodeInline } from 'renoun/components'

export function Basic() {
  return (
    <p>
      In React,{' '}
      <CodeInline value="<span style={{ color: 'blue' }} />" language="jsx" />{' '}
      changes the color of the text to blue.
    </p>
  )
}

export function AllowCopy() {
  return (
    <CodeInline
      allowCopy
      value={`npm install renoun`}
      language="sh"
      paddingX="0.8em"
      paddingY="0.5em"
    />
  )
}
