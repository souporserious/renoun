'use client'
import { Box } from 'components/Box'
import { useHover } from 'hooks/useHover'

export default function Hover() {
  const [hover, hoverProps] = useHover()

  return (
    <Box {...hoverProps} color={hover ? 'tomato' : 'papayawhip'}>
      Hover Me
    </Box>
  )
}
