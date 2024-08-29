'use client'
import { Box } from '..'
import { useHover } from '../../../hooks'

/** Using the `useHover` hook to change the color of the `Box` component when hovered. */
export default function Hover() {
  const [hover, hoverProps] = useHover()

  return (
    <Box {...hoverProps} color={hover ? 'tomato' : 'papayawhip'}>
      Hover Me
    </Box>
  )
}
