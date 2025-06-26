import { styled } from 'restyle'
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

export function Examples() {
  return (
    <Row variant="medium">
      <StyledLink href="https://github.com/souporserious/renoun/tree/main/examples/blog">
        <h3>Blog</h3>
        <p>A list of posts and a detail view for each post.</p>
      </StyledLink>
      <StyledLink href="https://github.com/souporserious/renoun/tree/main/examples/docs">
        <h3>Docs</h3>
        <p>A collection of documentation pages for a product.</p>
      </StyledLink>
      <StyledLink href="https://github.com/souporserious/renoun/tree/main/examples/design-system">
        <h3>Design System</h3>
        <p>Automated component documentation with examples.</p>
      </StyledLink>
    </Row>
  )
}
