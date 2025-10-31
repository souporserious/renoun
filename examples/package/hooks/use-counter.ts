import * as React from 'react'

/**
 * Provides a count that can be incremented and decremented.
 * TODO: track example values through a proxy so we can preseve the "state" through updates
 *
 * @example
 *
 * import { useCounter } from 'hooks'
 *
 * export default function Example({ initialCount = 0 }: { initialCount: number }) {
 *   const { count, increment, decrement } = useCounter(initialCount)
 *   return (
 *     <div>
 *       <button onClick={decrement}>-</button>
 *       <button onClick={increment}>+</button>
 *       <span>Count: {count}</span>
 *     </div>
 *   )
 * }
 */
export function useCounter(initialCount: number = 0) {
  const [count, setCount] = React.useState(initialCount)
  return {
    count,
    increment: () => setCount(count + 1),
    decrement: () => setCount(count - 1),
  }
}
