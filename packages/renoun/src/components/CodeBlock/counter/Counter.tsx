'use client'
import React from 'react'
import { useCounter } from './useCounter.js'

export default function Counter({ initialCount }: { initialCount: number }) {
  const { count, decrement, increment } = useCounter(initialCount)
  return (
    <div>
      <button onClick={decrement}>-</button>
      <span>{count}</span>
      <button onClick={increment}>+</button>
    </div>
  )
}
