import { useState } from 'react'

export function useCounter(initialValue: number = 0) {
  const [count, setCount] = useState(initialValue)
  return {
    count,
    increment: () => setCount(count + 1),
    decrement: () => setCount(count - 1),
  }
}
