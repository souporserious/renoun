export function SiblingLinks({
  previous,
  next,
}: {
  previous?: { pathname: string; label: string }
  next?: { pathname: string; label: string }
}) {
  return (
    <nav
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(16px, 1fr) auto',
        padding: '2rem 0',
        marginTop: 'auto',
        borderTop: '1px solid var(--color-separator)',
        position: 'sticky',
        bottom: 0,
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
  module?: { pathname: string; label: string }
  direction: 'previous' | 'next'
}) {
  if (!module) {
    return null
  }

  return (
    <a
      href={module.pathname}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto auto',
        gridTemplateRows: 'auto auto',
        gap: '0.5rem',
        fontSize: 'var(--font-size-body-2)',
        gridColumn: direction === 'previous' ? 1 : 3,
        textAlign: direction === 'previous' ? 'left' : 'right',
      }}
    >
      <div
        className="title"
        style={{
          gridColumn: direction === 'previous' ? 2 : 1,
          gridRow: 1,
        }}
      >
        {direction === 'previous' ? 'Previous' : 'Next'}
      </div>
      <div
        style={{
          gridColumn: '1 / -1',
          gridRow: 2,
          display: 'grid',
          gridTemplateColumns: 'subgrid',
          alignItems: 'center',
        }}
      >
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
        <span>{module.label}</span>
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
