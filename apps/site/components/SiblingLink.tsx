import Link from 'next/link'
import type { FileSystemSource } from 'renoun/collections'
import { styled } from 'restyle'

const StyledLink = styled(Link, {
  fontSize: 'var(--font-size-body-2)',
  display: 'grid',
  gridTemplateRows: 'auto auto',
  padding: '1.5rem 1rem',
  gap: '0.25rem',
  borderRadius: '0.25rem',
  backgroundColor: 'var(--color-surface-interactive)',
  color: 'var(--color-foreground-interactive)',
  stroke: 'var(--color-foreground-interactive)',
  ':hover': {
    backgroundColor: 'var(--color-surface-interactive-highlighted)',
    color: 'var(--color-foreground-interactive-highlighted)',
    stroke: 'var(--color-foreground-interactive-highlighted)',
  },
})

export async function SiblingLink({
  source,
  direction,
  variant,
}: {
  source: FileSystemSource<any>
  direction: 'previous' | 'next'
  variant?: 'name' | 'title'
}) {
  const metadata = await source.getExport('metadata').getValue()

  return (
    <StyledLink
      href={source.getPath()}
      css={{
        gridTemplateColumns:
          direction === 'previous' ? 'min-content auto' : 'auto min-content',
        gridColumn: direction === 'previous' ? 1 : 2,
        textAlign: direction === 'previous' ? 'left' : 'right',
      }}
    >
      <span
        css={{
          gridColumn: direction === 'previous' ? 2 : 1,
          gridRow: 1,
          fontSize: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {direction === 'previous' ? 'Previous' : 'Next'}
      </span>
      <div
        css={{
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
            css={{
              width: 'var(--font-size-body-2)',
              height: 'var(--font-size-body-2)',
            }}
          >
            <path
              d="M14 6L8 12L14 18"
              stroke="inherit"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
        <span>
          {variant === 'title'
            ? metadata?.label || metadata?.title || source.getTitle()
            : source.getName()}
        </span>
        {direction === 'next' ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            css={{
              width: 'var(--font-size-body-2)',
              height: 'var(--font-size-body-2)',
            }}
          >
            <path
              d="M10 18L16 12L10 6"
              stroke="inherit"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </div>
    </StyledLink>
  )
}
