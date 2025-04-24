import Link from 'next/link'
import {
  FileExportNotFoundError,
  FileNotFoundError,
  isDirectory,
  isJavaScriptFile,
  isMDXFile,
  type FileSystemEntry,
  type JavaScriptFile,
  type MDXFile,
} from 'renoun/file-system'
import { styled } from 'restyle'

export async function SiblingLink({
  entry,
  direction,
  variant,
}: {
  entry: FileSystemEntry<any>
  direction: 'previous' | 'next'
  variant?: 'name' | 'title'
}) {
  const metadata = await resolveEntryMetadata(entry)
  let baseName = entry.getBaseName()

  if (baseName.includes('-') && isJavaScriptFile(entry)) {
    const firstExport = await entry
      .getExports()
      .then((fileExports) => fileExports[0])

    baseName = firstExport.getName()
  }

  return (
    <StyledLink
      href={entry.getPath()}
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
          fontWeight: 600,
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

interface Metadata {
  metadata: {
    title: string
    label?: string
  }
}

/** Resolves metadata from a file system entry. */
async function resolveEntryMetadata(entry: FileSystemEntry) {
  let file: JavaScriptFile<Metadata> | MDXFile<Metadata>

  if (isDirectory(entry)) {
    const indexFile = await entry
      .getFile('index', ['ts', 'tsx'])
      .catch((error) => {
        if (error instanceof FileNotFoundError) {
          return undefined
        }
        throw error
      })

    if (indexFile) {
      file = indexFile
    } else {
      const readmeFile = await entry.getFile('readme', 'mdx').catch((error) => {
        if (error instanceof FileNotFoundError) {
          return undefined
        }
        throw error
      })

      if (readmeFile) {
        file = readmeFile as unknown as JavaScriptFile<Metadata>
      } else {
        return
      }
    }
  } else if (isJavaScriptFile<Metadata>(entry) || isMDXFile<Metadata>(entry)) {
    file = entry
  } else {
    return
  }

  const metadataExport = await file
    .getNamedExport('metadata')
    .catch((error) => {
      if (error instanceof FileExportNotFoundError) {
        return undefined
      }
      throw error
    })

  if (metadataExport) {
    return metadataExport.getRuntimeValue()
  }

  return
}
