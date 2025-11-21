'use client'
import { styled, type CSSObject } from 'restyle'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

import { Collapse } from '../Collapse'

const StyledLink = styled(Link, {
  display: 'flex',
  alignItems: 'center',
  // Keep desktop styles unchanged; only enhance on mobile
  // Larger touch targets on small screens (iOS/Android guidelines ~44–48px)
  '@media screen and (max-width: calc(60rem - 1px))': {
    width: '100%',
    minHeight: '2.75rem',
    padding: '0.5rem 0.75rem',
    borderRadius: '0.5rem',
    ':hover': {
      backgroundColor: 'var(--color-surface-interactive)',
    },
    ':active': {
      backgroundColor: 'var(--color-surface-interactive-highlighted)',
    },
  },
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
    display: 'flex',
    alignItems: 'center',
    padding: '0.25rem 0',
    '@media screen and (max-width: calc(60rem - 1px))': {
      minHeight: '2.75rem',
      padding: '0.5rem 0.75rem',
    },
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
            svg: {
              width: '0.75rem',
              height: '0.75rem',
            },
            '@media screen and (max-width: calc(60rem - 1px))': {
              width: '1.25rem',
              height: '1.25rem',
              left: '-1.5rem',
            },
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
