import React from 'react'
import { Code } from './Code'

export function Basic() {
  return <Code source="./counter/useCounter.ts" />
}

export function Inline() {
  return (
    <p>
      In React,{' '}
      <Code inline value="<span style={{ color: 'blue' }}>" language="tsx" />{' '}
      changes the color of the text to blue.
    </p>
  )
}
