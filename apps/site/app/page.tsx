export default function Page() {
  return (
    <main css={{ padding: '4rem 0' }}>
      <div css={{ maxWidth: '45rem' }}>
        <h1 css={{ fontSize: 'var(--font-size-heading)', textWrap: 'balance' }}>
          Docs That Match the Quality of Your Product
        </h1>
        <p
          css={{
            fontSize: 'var(--font-size-body)',
            lineHeight: 'var(--line-height-body)',
            letterSpacing: '0.01em',
            textWrap: 'balance',
          }}
        >
          Meticulously crafted React components and utilities, designed to
          elevate every stage of your JavaScript documentation.
        </p>
      </div>
    </main>
  )
}
