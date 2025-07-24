import React from 'react'

/** All appearance variants supported by `Button`. */
export type ButtonVariant = 'primary' | 'secondary' | 'danger'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style to apply. Defaults to `'primary'`. */
  variant?: ButtonVariant
}

/**
 * Maps a `ButtonVariant` to a Tailwind utility‑class string.
 *
 * @example
 * ```ts
 * // "bg-red-600 text-white hover:bg-red-700"
 * getButtonVariantClasses('danger')
 * ```
 */
export function getButtonVariantClassNames(
  variant: ButtonVariant = 'primary'
): string {
  switch (variant) {
    case 'secondary':
      return 'bg-gray-100 text-gray-800 hover:bg-gray-200'
    case 'danger':
      return 'bg-red-600 text-white hover:bg-red-700'
    case 'primary':
    default:
      return 'bg-blue-600 text-white hover:bg-blue-700'
  }
}

/**
 * A minimal, accessible button that follows design‑system color tokens.
 *
 * ```tsx
 * import { Button } from './Button'
 *
 * export default function Example() {
 *   return (
 *     <Button variant="secondary" onClick={() => alert('Clicked!')}>
 *       Save changes
 *     </Button>
 *   )
 * }
 * ```
 */
export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseClassNames = `inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium`
  const variantClassNames = getButtonVariantClassNames(variant)

  return (
    <button
      className={`${baseClassNames} ${variantClassNames}${className ? ` ${className}` : ''}`}
      {...props}
    >
      {children}
    </button>
  )
}
