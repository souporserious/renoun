import * as React from 'react'

export function useHover() {
  const [isHovered, setIsHovered] = React.useState(false)
  return {
    isHovered,
    hoverProps: {
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
    },
  }
}
