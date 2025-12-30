import Link from 'next/link'
import {
  resolveFileFromEntry,
  isJavaScriptFile,
  ModuleExportNotFoundError,
  type FileSystemEntry,
} from 'renoun'
import { styled } from 'restyle'

export async function SiblingLink({
  entry,
  direction,
  variant,
}: {
  entry: FileSystemEntry
  direction: 'previous' | 'next'
  variant?: 'name' | 'title'
}) {
  const file = await resolveFileFromEntry<
    {
      mdx: {
        metadata: {
          label?: string
          title?: string
        }
      }
    },
    'mdx'
  >(entry, 'mdx')
  const metadata = file
    ? await file.getExportValue('metadata').catch((error) => {
        if (error instanceof ModuleExportNotFoundError) {
          return undefined
        }
        throw error
      })
    : undefined
  let baseName = entry.baseName
  let javaScriptFile = isJavaScriptFile(file)
    ? file
    : isJavaScriptFile(entry)
      ? entry
      : undefined

  if (javaScriptFile) {
    const fileExports = await javaScriptFile.getExports()

    if (baseName.toLowerCase() === 'index') {
      const firstExport = fileExports[0]

      if (firstExport) {
        baseName = firstExport.getName()
      }
    }
  }

  return (
    <StyledLink
      href={entry.getPathname()}
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
          fontSize: 'var(--font-size-title)',
          fontWeight: 'var(--font-weight-strong)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--color-foreground) !important',
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
            ? metadata?.label || metadata?.title || entry.getTitle()
            : baseName}
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
