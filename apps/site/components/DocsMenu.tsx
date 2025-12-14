'use client'
import { useEffect, useId, useRef, useState, type FocusEvent } from 'react'
import { usePathname } from 'next/navigation'

import { NavigationLink } from './NavigationLink'

const docsQuickLinks = [
  {
    href: '/components',
    label: 'Components',
  },
  {
    href: '/hooks',
    label: 'Hooks',
  },
  {
    href: '/utilities/file-system',
    label: 'Utilities',
    activePathname: '/utilities',
  },
  {
    href: '/guides',
    label: 'Guides',
  },
]

export function DocsMenu() {
  const pathname = usePathname()
  const triggerRef = useRef<HTMLAnchorElement>(null)
  const previousPathname = useRef<string | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuId = useId()

  const closeMenuIfFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsMenuOpen(false)
    }
  }

  useEffect(() => {
    if (
      previousPathname.current !== null &&
      previousPathname.current !== pathname
    ) {
      triggerRef.current?.blur()
    }
    previousPathname.current = pathname
  }, [pathname])

  return (
    <nav
      aria-label="Docs menu"
      data-open={isMenuOpen}
      css={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        '&:hover .docs-menu, & .docs-menu:hover, &:has(.docs-trigger:focus-visible) .docs-menu, &:has(.docs-menu :focus-visible) .docs-menu, &[data-open="true"] .docs-menu':
          {
            opacity: 1,
            pointerEvents: 'auto',
            transform: 'translate(-50%, 0)',
          },
        '&:hover svg, &:has(.docs-trigger:focus-visible) svg, &:has(.docs-menu :focus-visible) svg, &[data-open="true"] svg':
          {
            transform: 'rotate(180deg)',
            color: 'var(--color-foreground-interactive-highlighted)',
          },
      }}
      onPointerEnter={() => setIsMenuOpen(true)}
      onPointerLeave={() => setIsMenuOpen(false)}
      onFocusCapture={() => setIsMenuOpen(true)}
      onBlurCapture={closeMenuIfFocusLeaves}
    >
      <NavigationLink
        ref={triggerRef}
        href="/docs/introduction"
        activePathnames={[
          '/docs',
          '/components',
          '/hooks',
          '/utilities',
          '/guides',
        ]}
        aria-haspopup="true"
        className="docs-trigger"
        aria-expanded={isMenuOpen}
        aria-controls={menuId}
      >
        Docs
        <svg
          width="0.75rem"
          height="0.75rem"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          css={{
            transition: 'transform 150ms ease',
            transformOrigin: '50% 50%',
            color: 'var(--color-foreground-interactive)',
          }}
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </NavigationLink>
      <ul
        className="docs-menu"
        id={menuId}
        role="menu"
        css={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translate(-50%, -0.25rem)',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          backgroundColor: 'rgba(12, 15, 23, 0.8)',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--color-separator)',
          borderRadius: '0.5rem',
          boxShadow: `0px 16px 32px rgba(12, 15, 23, 0.35), 0px 6px 12px rgba(12, 15, 23, 0.25)`,
          padding: '0.5rem 0',
          minWidth: '10rem',
          opacity: 0,
          pointerEvents: 'none',
          transition: 'opacity 150ms ease, transform 150ms ease',
          zIndex: 10,
          listStyle: 'none',
          margin: 0,
        }}
      >
        {docsQuickLinks.map((item) => (
          <li key={item.href} role="none">
            <NavigationLink
              href={item.href}
              activePathnames={[item.activePathname ?? item.href]}
              css={{
                color: 'var(--color-foreground-interactive)',
                padding: '0.5rem 1rem',
                width: '100%',
                display: 'block',
                ':hover': {
                  color: 'var(--color-foreground-interactive-highlighted)',
                },
              }}
              role="menuitem"
            >
              {item.label}
            </NavigationLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
