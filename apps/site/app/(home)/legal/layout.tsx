export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="prose-alternate"
      css={{
        gridColumn: '1 / -2',
        display: 'flex',
        flexDirection: 'column',

        '@media (min-width: 60rem)': {
          padding: '4rem 8rem',
        },
      }}
    >
      {children}
    </div>
  )
}
