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
        gap: '4rem',
        padding: '0 1.75rem 7rem',
        textAlign: 'center',

        '@media (min-width: 60rem)': {
          // Place into the content track of the subgrid (3rd column in span)
          gridColumn: '3 / 4',
          padding: '2rem 0 9rem',
        },
      }}
    >
      <section
        css={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2.75rem',
          maxWidth: '56rem',
        }}
      >
        <header
          css={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            maxWidth: '48rem',
          }}
        >
          <h1
            css={{
              fontSize: 'clamp(3rem, 6vw, 4.75rem)',
              lineHeight: 1.05,
              letterSpacing: '-0.025em',
              margin: 0,
            }}
          >
            Documentation
            <br />
            Done Differently
          </h1>
        </header>

        <div
          css={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.75rem',
            fontSize: 'clamp(1.6rem, 5vw, 2.4rem)',
            lineHeight: 'clamp(2.2rem, 6.5vw, 3rem)',
            color: 'hsla(210, 100%, 90%, 0.85)',
            textAlign: 'left',
            '@media (min-width: 60rem)': {
              fontSize: 'var(--font-size-heading-2)',
              lineHeight: 'var(--line-height-heading-2)',
            },
          }}
        >
          <p>
            You’re in one of two states, your docs are out of sync, or your docs
            are non-existent.
          </p>
          <p>
            This has been the plight of my software engineering career. It
            doesn’t matter if it’s a personal project I’m trying to ship or
            working with my team to release a new design-system site that
            actually communicates our brand ethos.
          </p>
          <p>
            The problem? You’re forced into tools outside your own code, tools
            that don’t run at 60 fps or reflect the level of polish you build
            into your product.
          </p>
          <p>
            Current offerings are too domain-specific and often bolt on a
            separate build step or have incentives outside of building great
            docs, which we all know is a problem.
          </p>
          <p>
            I never understood why I had to write the source code and then write
            the same thing again for documentation. It goes against the first
            thing you learn as an engineer, don’t repeat yourself.
          </p>
          <p>
            I built renoun to fix this, to let you focus on the quality and
            craft you pour into your product every day, and showcase that same
            quality through your documentation.
          </p>
          <p>
            Documentation is the soul of your company, it shouldn’t feel like
            every other product because you’re not every other product, you’re
            renoun.
          </p>
        </div>
        <JoinButton />
      </section>
    </div>
  )
}
