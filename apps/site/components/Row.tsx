const variants = {
  large: '16rem',
  medium: '12rem',
}

export function Row({
  children,
  variant = 'medium',
}: {
  children: React.ReactNode
  variant?: keyof typeof variants
}) {
  const width = variants[variant]

  return (
    <div
      css={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${width}, 1fr))`,
        gap: '1rem',
      }}
    >
      {children}
    </div>
  )
}
