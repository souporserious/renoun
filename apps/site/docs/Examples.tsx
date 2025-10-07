import { Directory, isDirectory } from 'renoun'
import { styled } from 'restyle'
import { z } from 'zod'

import { Row } from '@/components/Row'

const StyledLink = styled('a', {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '0.25rem',
  backgroundColor: 'var(--color-surface-interactive)',
  ':hover': {
    backgroundColor: 'var(--color-surface-interactive-highlighted)',
    textDecoration: 'none !important',
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
    letterSpacing: '0.025em',
    textWrap: 'balance',
    color: 'var(--color-foreground-interactive)',
  },
})

const ExamplesDirectory = new Directory({
  path: '../../examples',
  basePathname: null,
})

const packageSchema = z.object({
  name: z.string(),
  description: z.string().min(1, 'Each example must provide a description.'),
})

export async function Examples() {
  const entries = await ExamplesDirectory.getEntries()
  const directories = entries.filter(isDirectory)

  const examples = (
    await Promise.all(
      directories.map(async (entry) => {
        const packageJson = await entry.getFile('package', 'json')
        const { name, description } = packageSchema.parse(await packageJson.get())
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
          href: `https://github.com/souporserious/renoun/tree/main/${repositoryPath}`,
        }
      })
    )
  )
    .filter((example): example is NonNullable<typeof example> => example !== null)
    .sort((a, b) => a.title.localeCompare(b.title))

  return (
    <Row variant="medium">
      {examples.map((example) => (
        <StyledLink key={example.href} href={example.href}>
          <h3>{example.title}</h3>
          <p>{example.description}</p>
        </StyledLink>
      ))}
    </Row>
  )
}
