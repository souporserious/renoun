import { CodeInline } from 'omnidoc/components'

export default function Page() {
  return (
    <main css={{ padding: '4rem 0' }}>
      <div css={{ maxWidth: '45rem' }}>
        <h1
          css={{
            fontSize: 'var(--font-size-heading)',
            textWrap: 'balance',
            margin: 0,
          }}
        >
          Documentation That Matches the Quality of Your Product
        </h1>
        <div css={{ height: '2lh' }} />
        <p
          css={{
            fontSize: 'var(--font-size-body)',
            lineHeight: 'var(--line-height-body)',
            letterSpacing: '0.01em',
            textWrap: 'balance',
            margin: 0,
          }}
        >
          Meticulously crafted React components and utilities, designed to
          elevate every stage of your JavaScript documentation.
        </p>
        <div css={{ height: '3lh' }} />
        <CodeInline
          allowCopy
          value={`npm install omnidoc`}
          language="bash"
          paddingX="0.8em"
          paddingY="0.5em"
          css={{ fontSize: 'var(--font-size-code)' }}
        />
      </div>
    </main>
  )
}
