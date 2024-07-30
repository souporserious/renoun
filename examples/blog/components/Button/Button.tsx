'use client'

export function Button({
  children = 'Button',
  onClick,
}: {
  children: React.ReactNode
  onClick?: () => void
}) {
  return <button onClick={onClick}>{children}</button>
}

export type ButtonProps = React.ComponentProps<typeof Button>
