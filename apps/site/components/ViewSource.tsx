import type { CSSObject } from 'restyle'

export function ViewSource({ href, css }: { href: string; css?: CSSObject }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      css={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: 'var(--font-size-body-3)',
        ...css,
      }}
    >
      View Source{' '}
      <svg
        fill="none"
        width="1em"
        height="1em"
        stroke="var(--color-foreground-interactive)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
        css={{ position: 'relative', top: '-0.08rem' }}
      >
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"></path>
        <path d="M15 3h6v6"></path>
        <path d="M10 14L21 3"></path>
      </svg>
    </a>
  )
}
