'use client'
import { useEffect, useRef } from 'react'
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
    <div
      css={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        '&:hover .docs-menu, & .docs-menu:hover, &:has(.docs-trigger:focus-visible) .docs-menu, &:has(.docs-menu :focus-visible) .docs-menu':
          {
            opacity: 1,
            pointerEvents: 'auto',
            transform: 'translate(-50%, 0)',
          },
        '&:hover svg, &:has(.docs-trigger:focus-visible) svg, &:has(.docs-menu :focus-visible) svg':
          {
            transform: 'rotate(180deg)',
            color: 'var(--color-foreground-interactive-highlighted)',
          },
      }}
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
      <div
        className="docs-menu"
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
        }}
      >
        {docsQuickLinks.map((item) => (
          <NavigationLink
            key={item.href}
            href={item.href}
            activePathnames={[item.activePathname ?? item.href]}
            css={{
              color: 'var(--color-foreground-interactive)',
              padding: '0.5rem 1rem',
              width: '100%',
              ':hover': {
                color: 'var(--color-foreground-interactive-highlighted)',
              },
            }}
          >
            {item.label}
          </NavigationLink>
        ))}
      </div>
    </div>
  )
}
