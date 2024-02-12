import React from 'react'
import { CodeInline } from './CodeInline'

export function Basic() {
  return (
    <p>
      In React,{' '}
      <CodeInline value="<span style={{ color: 'blue' }}>" language="jsx" />{' '}
      changes the color of the text to blue.
    </p>
  )
}
