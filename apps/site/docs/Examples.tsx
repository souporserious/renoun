import { Directory, isDirectory } from 'renoun'
import { Logo } from 'renoun/components'
import { styled } from 'restyle'
import { z } from 'zod'

import { Row } from '@/components/Row'

const StyledCard = styled('div', {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  borderRadius: '0.25rem',
  backgroundColor: 'var(--color-surface-interactive)',
  '&:hover': {
    backgroundColor: 'var(--color-surface-interactive-highlighted)',
  },
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
    minHeight: 'calc(var(--line-height-body-2) * 3 + 3rem)',
    letterSpacing: '0.025em',
    textWrap: 'balance',
    color: 'var(--color-foreground-interactive)',
  },
})

const StyledOverlayLink = styled('a', {
  position: 'absolute',
  inset: 0,
  borderRadius: '0.25rem',
  textDecoration: 'none !important',
  zIndex: 1,
})

const StyledContent = styled('div', {
  position: 'relative',
  zIndex: 0,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
})

const StyledSourceLink = styled('a', {
  position: 'absolute',
  top: '0.5rem',
  right: '0.5rem',
  zIndex: 2,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '6px',
  color: 'var(--color-foreground-secondary)',
  backgroundColor: 'transparent',
  textDecoration: 'none',
  ':hover': {
    color: 'var(--color-foreground-primary)',
    backgroundColor: 'var(--color-surface-secondary)',
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
        const packageJson = await entry.getFile('package', 'json')
        const { name, description, homepage } = packageSchema.parse(
          await packageJson.get()
        )
        const relativePath = entry.getRelativePathToRoot()
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
          homepage: homepage ?? null,
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
          <StyledOverlayLink
            href={example.homepage ?? example.repositoryHref}
            aria-label={`${example.title} ${example.homepage ? 'live site' : 'source code'}`}
          />
          <StyledSourceLink
            href={example.repositoryHref}
            aria-label={`${example.title} source code on GitHub`}
          >
            <Logo variant="gitHost" css={{ width: 18, height: 18 }} />
          </StyledSourceLink>
          <StyledContent>
            <h3>{example.title}</h3>
            <p>{example.description}</p>
          </StyledContent>
        </StyledCard>
      ))}
    </Row>
  )
}
