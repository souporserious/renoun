import { JoinButton } from './JoinButton'

export default function Page() {
  return (
    <div
      data-grid="manual"
      css={{
        gridColumn: '2 / -2',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2.5rem',
        padding: '0 1.75rem 7rem',
        textAlign: 'center',

        '@media (min-width: 60rem)': {
          // Span the full subgrid so the hero doesn't get cramped
          gridColumn: '1 / -1',
          padding: '2rem 2.5rem 9rem',
        },
      }}
    >
      <section
        css={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem',
          maxWidth: '88rem',
        }}
      >
        <div
          css={{
            display: 'grid',
            gap: '2.5rem',
            alignItems: 'center',
            width: '100%',
            padding: '2rem 0',

            '@media (min-width: 60rem)': {
              gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)',
              gap: '4rem',
              padding: '4rem 0',
            },
          }}
        >
          <h1
            css={{
              fontSize: 'clamp(3.2rem, 8vw, 6rem)',
              lineHeight: 1.03,
              letterSpacing: '-0.03em',
              margin: 0,
              textWrap: 'balance',
              textAlign: 'center',

              '@media (min-width: 60rem)': {
                textAlign: 'left',
              },
            }}
          >
            Your Repo Has
            <br />a Lot to Say
          </h1>

          <div
            css={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              alignItems: 'center',
              maxWidth: '38rem',
              justifySelf: 'center',

              '@media (min-width: 60rem)': {
                alignItems: 'flex-start',
                textAlign: 'left',
                justifySelf: 'end',
              },
            }}
          >
            <p
              css={{
                fontSize: 'clamp(1.6rem, 4.4vw, 2.1rem)',
                lineHeight: 'clamp(2.2rem, 6vw, 2.9rem)',
                textWrap: 'pretty',
                color: 'hsla(210, 100%, 90%, 0.85)',
                margin: 0,

                '@media (min-width: 60rem)': {
                  fontSize: 'var(--font-size-heading-2)',
                  lineHeight: 'var(--line-height-heading-2)',
                },
              }}
            >
              Turn your JavaScript, TypeScript, Markdown, and MDX into reusable
              structured data for blogs, docs, and presentations so your content
              always matches what’s in your codebase.
            </p>

            <div
              css={{
                display: 'flex',
                gap: '1rem',
                flexWrap: 'wrap',
                justifyContent: 'center',
                width: '100%',
                flexDirection: 'row',
                alignItems: 'center',

                '@media (min-width: 60rem)': {
                  justifyContent: 'flex-start',
                  alignItems: 'flex-start',
                },
              }}
            >
              <a
                href="/docs/getting-started"
                css={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.9rem 1.5rem',
                  backgroundColor: 'var(--color-surface-accent)',
                  color: '#0c0900',
                  border: '1px solid transparent',
                  borderRadius: '0.75rem',
                  fontSize: 'var(--font-size-button-1)',
                  fontWeight: 'var(--font-weight-button)',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  width: 'fit-content',
                  transition: 'transform 150ms ease, box-shadow 200ms ease',

                  ':hover': {
                    transform: 'translateY(-1px)',
                    boxShadow:
                      '0 14px 28px color-mix(in srgb, var(--color-surface-accent) 25%, transparent)',
                  },
                  ':focus-visible': {
                    outline: 'none',
                    boxShadow:
                      '0 0 0 3px color-mix(in srgb, var(--color-background) 20%, transparent), 0 0 0 6px color-mix(in srgb, var(--color-surface-accent) 55%, transparent)',
                  },
                }}
              >
                Get Started
              </a>

              <a
                href="/docs/examples"
                css={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0.9rem 1.5rem',
                  backgroundColor: 'transparent',
                  color: 'var(--color-foreground)',
                  border: '1px solid var(--color-surface-accent)',
                  borderRadius: '0.75rem',
                  fontSize: 'var(--font-size-button-1)',
                  fontWeight: 'var(--font-weight-button)',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  width: 'fit-content',
                  transition: 'background-color 0.2s',

                  ':hover': {
                    backgroundColor:
                      'var(--color-surface-interactive-highlighted)',
                  },
                }}
              >
                Explore Examples
              </a>
            </div>
          </div>
        </div>
      </section>

      <JoinButton />
    </div>
  )
}
