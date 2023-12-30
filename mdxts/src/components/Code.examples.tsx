import React from 'react'
import { Code } from './Code'

const value = `
import React, { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);

  const increment = () => {
    setCount(count + 1);
  };

  const decrement = () => {
    setCount(count - 1);
  };

  return (
    <div>
      <h2>Counter: {count}</h2>
      <button onClick={increment}>Increment</button>
      <button onClick={decrement}>Decrement</button>
    </div>
  );
}
`

export function Basic() {
  return <Code value={value} language="tsx" />
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
