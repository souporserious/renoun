export function SiblingLinks({
  previous,
  next,
}: {
  previous?: { pathname: string; title: string }
  next?: { pathname: string; title: string }
}) {
  return (
    <nav
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(16px, 1fr) auto',
        padding: '4rem 0 2rem',
      }}
    >
      <SiblingLink module={previous} direction="previous" />
      <SiblingLink module={next} direction="next" />
    </nav>
  )
}

function SiblingLink({
  module,
  direction,
}: {
  module?: { pathname: string; title: string }
  direction: 'previous' | 'next'
}) {
  if (!module) {
    return null
  }

  return (
    <a
      href={module.pathname}
      style={{
        fontSize: 'var(--font-size-body-2)',
        gridColumn: direction === 'previous' ? 1 : 3,
        textAlign: direction === 'previous' ? 'left' : 'right',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {direction === 'previous' ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            style={{
              width: 'var(--font-size-body-2)',
              height: 'var(--font-size-body-2)',
            }}
          >
            <path
              d="M14 6L8 12L14 18"
              stroke="var(--color-foreground-interactive)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
        <span>{module.title}</span>
        {direction === 'next' ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            style={{
              width: 'var(--font-size-body-2)',
              height: 'var(--font-size-body-2)',
            }}
          >
            <path
              d="M10 18L16 12L10 6"
              stroke="var(--color-foreground-interactive)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </div>
    </a>
  )
}
