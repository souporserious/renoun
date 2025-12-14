import React from 'react'

type Direction = 'left' | 'right'

interface ArrowIconProps {
  color?: string
  direction?: Direction
  size?: number
  className?: string
}

interface DataURIOptions {
  color?: string
  direction?: Direction
  size?: number
}

const paths = {
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
}

export function ArrowIcon({
  color = 'currentColor',
  direction = 'right',
  size = 24,
  className,
}: ArrowIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={paths[direction]} />
    </svg>
  )
}

ArrowIcon.toDataURI = ({
  color,
  direction = 'right',
  size = 24,
}: DataURIOptions) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24' fill="none" stroke='${color}' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='${paths[direction]}'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
