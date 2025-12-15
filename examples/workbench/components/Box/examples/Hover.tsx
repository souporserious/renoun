'use client'
import { Box } from '@/components'
import { useHover } from '@/hooks'

/** Using the `useHover` hook to change the color of the `Box` component when hovered. */
export default function Hover() {
  const [hover, hoverProps] = useHover()

  return (
    <Box
      {...hoverProps}
      padding={16}
      backgroundColor={
        hover ? 'rgba(96, 165, 250, 0.15)' : 'rgba(148, 163, 184, 0.06)'
      }
      style={{
        borderRadius: 8,
        border: '1px solid rgba(148, 163, 184, 0.25)',
        transition: 'background-color 150ms ease, transform 150ms ease',
        transform: hover ? 'translateY(-1px)' : 'translateY(0)',
        cursor: 'pointer',
      }}
    >
      Hover to highlight this box
    </Box>
  )
}

