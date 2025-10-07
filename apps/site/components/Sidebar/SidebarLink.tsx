'use client'
import { styled, type CSSObject } from 'restyle'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

import { Collapse } from '../Collapse'

const StyledLink = styled(Link, {
  display: 'block',
  padding: '0.25rem 0',
})

export function SidebarLink({
  pathname,
  label,
  css,
  collapsible = false,
}: {
  pathname: string
  label: string
  css?: CSSObject
  collapsible?: boolean
}) {
  const activePathname = usePathname()
  const isActive = pathname === activePathname
  const styles: CSSObject = {
    display: 'block',
    padding: '0.25rem 0',
  }

  if (isActive) {
    styles.color = 'var(--color-foreground)'
    styles.textShadow = '0.01em 0 currentColor,-0.01em 0 currentColor'
  } else {
    styles.color = 'var(--color-foreground-interactive)'
    styles[':hover'] = {
      color: 'var(--color-foreground-interactive-highlighted)',
    }
  }

  if (collapsible) {
    return (
      <div
        css={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          position: 'relative',
          ...css,
        }}
      >
        <Collapse.Trigger
          aria-label="Toggle section"
          css={{
            width: '0.875rem',
            height: '0.875rem',
            position: 'absolute',
            left: '-1.15rem',
            color: 'var(--color-foreground-secondary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '0.25rem',
            ':focus': {
              outline: 'none',
            },
            ':focus-visible': {
              outline: '2px solid var(--color-foreground-interactive)',
              outlineOffset: '2px',
            },
          }}
        />
        <StyledLink href={pathname} css={styles}>
          {label}
        </StyledLink>
      </div>
    )
  }

  return (
    <StyledLink href={pathname} css={{ ...styles, ...css }}>
      {label}
    </StyledLink>
  )
}
