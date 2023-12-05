export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          padding: '1rem',
          backgroundColor: '#d39e5a',
          color: '#1c1309',
          textAlign: 'center',
        }}
      >
        This package is still a work in progress. The APIs are not stable and
        may change.
      </div>
      {children}
    </>
  )
}
