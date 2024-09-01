import { CodeInline } from 'omnidoc/components'

import { SignupForm } from './SignupForm'

export default function Page() {
  return (
    <main
      css={{
        display: 'flex',
        flexDirection: 'column',
        padding: '4rem 0',
        gap: '4rem',
      }}
    >
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
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '4rem 4rem 6rem',
          gap: '3rem',
          background: '#0d0f10',
          borderRadius: '0.5rem',
        }}
      >
        <div
          css={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <h2
            css={{
              fontSize: 'var(--font-size-subheading)',
              margin: 0,
            }}
          >
            Stay Updated
          </h2>
          <p
            css={{
              fontSize: 'var(--font-size-body)',
              margin: 0,
            }}
          >
            Get Notified When Omnidoc is ready
          </p>
        </div>
        <SignupForm />
      </div>
    </main>
  )
}
