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

export function Ordered() {
  return (
    <>
      <Code filename="01.example.ts" value="const a = 1;" />
      <Code filename="02.example.ts" value="const a = 1; const b = 2;" />
    </>
  )
}
