export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      css={{
        gridColumn: '1 / -1',
        display: 'flex',
        flexDirection: 'column',
        gap: '4rem',

        '@media (min-width: 60rem)': {
          padding: '4rem 8rem',
        },
      }}
    >
      {children}
    </div>
  )
}
