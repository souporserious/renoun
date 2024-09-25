export function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      css={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(12rem, 1fr))`,
        gap: '1rem',
      }}
    >
      {children}
    </div>
  )
}
