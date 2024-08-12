import * as React from 'react'

/**
 * Provides state and event handlers for listening to hover events.
 *
 * @example
 *
 * import { useHover } from 'hooks'
 *
 * export default function Example() {
 *   const [hover, hoverProps] = useHover()
 *   return (
 *     <div {...hoverProps}>
 *       Hover me! {hover ? 'Hovered' : 'Not hovered'}
 *     </div>
 *   )
 * }
 */
export function useHover() {
  const [hover, setHover] = React.useState(false)
  return [
    hover,
    {
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
    },
  ]
}
