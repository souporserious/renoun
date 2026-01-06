'use client'
import type { ReactNode, CSSProperties } from 'react'

type MarkProps = {
  children: ReactNode
  style?: CSSProperties
}

// A single brush stroke SVG that stretches naturally across any width
// The organic shape simulates a real highlighter marker stroke
const brushStrokeSvg = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 12' preserveAspectRatio='none'>
  <path d='M0 2.5 C2 1, 6 0.5, 12 1.5 C25 0, 40 1, 50 0.8 C60 0.3, 75 1.2, 88 0.5 C94 1, 98 1.5, 100 2 L100 9.5 C98 10.5, 94 11, 88 10 C75 11.5, 60 10.2, 50 11 C40 10.5, 25 11.5, 12 10.5 C6 11.2, 2 10.8, 0 9.5 Z' fill='%23f0c830' fill-opacity='0.42'/>
</svg>
`.trim()

/**
 * A highlighter mark component that renders a natural-looking pen stroke
 * behind text using a stretched SVG brush stroke.
 */
export function Mark({ children, style }: MarkProps) {
  return (
    <mark
      style={{
        position: 'relative',
        display: 'inline',
        backgroundColor: 'transparent',
        color: 'white',
        padding: '0.12em 0.3em',
        margin: '0 -0.3em',
        backgroundImage: `url("data:image/svg+xml,${brushStrokeSvg.replace(/\n/g, '')}")`,
        backgroundSize: '100% 90%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center 60%',
        boxDecorationBreak: 'clone',
        WebkitBoxDecorationBreak: 'clone',
        ...style,
      }}
    >
      {children}
    </mark>
  )
}
