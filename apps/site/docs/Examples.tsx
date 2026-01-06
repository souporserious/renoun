import { Directory, isDirectory } from 'renoun'
import { styled } from 'restyle'
import { z } from 'zod'

import { Row } from '@/components/Row'

const StyledCard = styled('div', {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  borderRadius: '0.25rem',
  overflow: 'hidden',
  backgroundColor: 'var(--color-surface-interactive)',
  '& h3': {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    aspectRatio: '21 / 9',
    margin: 0,
    backgroundColor: 'var(--color-surface-secondary)',
    color: 'var(--color-foreground-secondary)',
  },
  '& p': {
    fontSize: 'var(--font-size-body-3)',
    lineHeight: 'var(--line-height-body-2)',
    textAlign: 'center',
    padding: '1.5rem 0.75rem',
    minHeight: 'calc(var(--line-height-body-2) * 2 + 3rem)',
    letterSpacing: '0.025em',
    textWrap: 'balance',
    color: 'var(--color-foreground-interactive)',
  },
})

const StyledContent = styled('div', {
  position: 'relative',
  zIndex: 0,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
})

const StyledFooter = styled('div', {
  display: 'flex',
  borderTop: '1px solid var(--color-separator)',
  borderBottom: '1px solid var(--color-separator)',
})

const StyledFooterLink = styled('a', {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.75rem 0.5rem',
  fontSize: 'var(--font-size-button-2)',
  fontWeight: 'var(--font-weight-button)',
  letterSpacing: '0.02em',
  color: 'var(--color-foreground-interactive)',
  backgroundColor: 'transparent',
  textDecoration: 'none !important',
  outline: 'none',
  ':hover': {
    color: 'var(--color-foreground-interactive-highlighted)',
    backgroundColor: 'var(--color-surface-secondary)',
    textDecoration: 'none !important',
    outline: 'none',
  },
  ':focus': {
    outline: 'none',
    textDecoration: 'none !important',
  },
  ':focus-visible': {
    outline: 'none',
    textDecoration: 'none !important',
  },
  ':active': {
    outline: 'none',
    textDecoration: 'none !important',
  },
  ':not(:first-child)': {
    borderLeft: '1px solid var(--color-separator)',
  },
})

const ExamplesDirectory = new Directory({
  path: 'workspace:examples',
  basePathname: null,
})

const packageSchema = z.object({
  name: z.string(),
  description: z.string().min(1, 'Each example must provide a description.'),
  homepage: z.string().url().optional(),
})

export async function Examples() {
  const entries = await ExamplesDirectory.getEntries()
  const directories = entries.filter(isDirectory)

  const examples = (
    await Promise.all(
      directories.map(async (entry) => {
        const packageJson = await entry.getFile('package.json')
        const { name, description, homepage } = packageSchema.parse(
          await packageJson.get()
        )
        const relativePath = entry.relativePath
        const repositoryPath = relativePath.startsWith('examples')
          ? relativePath
          : ['examples', relativePath].filter(Boolean).join('/')
        const title = name
          .split('/')
          .at(-1)!
          .split('-')
          .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
          .join(' ')

        return {
          title,
          description,
          homepage,
          repositoryHref: `https://github.com/souporserious/renoun/tree/main/${repositoryPath}`,
        }
      })
    )
  )
    .filter(
      (example): example is NonNullable<typeof example> => example !== null
    )
    .sort((a, b) => a.title.localeCompare(b.title))

  return (
    <Row variant="medium">
      {examples.map((example) => (
        <StyledCard key={example.title}>
          <StyledContent>
            <h3>{example.title}</h3>
            <StyledFooter>
              <StyledFooterLink
                href={example.repositoryHref}
                aria-label={`${example.title} source code on GitHub`}
              >
                Source
              </StyledFooterLink>
              {example.homepage && (
                <StyledFooterLink
                  href={example.homepage}
                  aria-label={`${example.title} live demo`}
                >
                  Demo
                </StyledFooterLink>
              )}
            </StyledFooter>
            <p>{example.description}</p>
          </StyledContent>
          {/* Footer moved above description */}
        </StyledCard>
      ))}
    </Row>
  )
}
