'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SVGProps } from 'react'
import { useRouter } from 'next/navigation'
import {
  Autocomplete,
  Button,
  Dialog,
  DialogTrigger,
  Input,
  Menu,
  MenuItem,
  Modal,
  ModalOverlay,
  TextField,
  Section,
  Header,
  useFilter,
} from 'react-aria-components'

import type { SearchRoute } from '@/lib/get-search-routes'

export function SearchDialog({ routes }: { routes: SearchRoute[] }) {
  const [isOpen, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const router = useRouter()
  const { contains } = useFilter({ sensitivity: 'base' })
  const isMac = useMemo(
    () =>
      typeof navigator === 'undefined'
        ? false
        : /mac(os|intosh)/i.test(navigator.userAgent),
    []
  )

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) {
      return routes
    }

    return routes.filter((entry) => {
      return (
        contains(entry.title, searchQuery) ||
        contains(entry.pathname, searchQuery)
      )
    })
  }, [contains, routes, searchQuery])

  const menuItems = useMemo(
    () => filteredEntries.map((entry) => ({ ...entry, id: entry.pathname })),
    [filteredEntries]
  )

  // Derive a category from the first segment of the pathname
  function getCategory(pathname: string) {
    const segments = pathname.split('/').filter(Boolean)
    if (!segments.length) return 'General'
    const root = segments[0]
    switch (root.toLowerCase()) {
      case 'docs':
        return 'Docs'
      case 'guides':
        return 'Guides'
      case 'components':
        return 'Components'
      case 'hooks':
        return 'Hooks'
      case 'api':
        return 'API'
      case 'reference':
        return 'Reference'
      default:
        return root.charAt(0).toUpperCase() + root.slice(1)
    }
  }

  const groupedEntries = useMemo(() => {
    const map = new Map<string, typeof filteredEntries>()
    for (const entry of filteredEntries) {
      const cat = getCategory(entry.pathname)
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(entry)
    }
    // Preserve original order of appearance while keeping group order stable
    return Array.from(map.entries()).map(([category, items]) => ({
      category,
      items,
    }))
  }, [filteredEntries])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() === 'k' &&
        (isMac ? event.metaKey : event.ctrlKey)
      ) {
        event.preventDefault()
        setOpen((prev) => !prev)
      }

      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isMac])

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('')
    }
  }, [isOpen])

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setOpen}>
      <Button
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '6.675rem',
          height: '2.25rem',
          borderRadius: 8,
          background: 'var(--color-surface-secondary, #f5f5f5)',
          color: 'var(--color-foreground, #ffffff)',
          padding: '0 0.75rem',
          fontSize: '.875rem',
          lineHeight: '1.25rem',
          fontWeight: 500,
          fontFamily: 'inherit',
          gap: '0.5rem',
          cursor: 'default',
          outline: 'none',
          border: 'none',
        }}
      >
        <SearchIcon
          style={{
            width: 16,
            height: 16,
            color: 'var(--color-foreground-interactive, #9ca3af)',
          }}
        />
        <span style={{ flex: 1, textAlign: 'left' }}>Search</span>
        <span style={{ display: 'none' /* hide small screens */ }}>
          <kbd
            style={{
              height: '1.25rem',
              padding: '0 0.5rem',
              fontWeight: 600,
              borderRadius: 4,
              fontSize: '0.75rem',
              background: 'var(--color-surface-interactive, #e5e7eb)',
              color: 'var(--color-foreground-interactive, #374151)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isMac ? '⌘ K' : 'Ctrl K'}
            <script>
              {`document.currentScript.previousSibling.textContent = /mac(os|intosh)/i.test(navigator.userAgent) ? '⌘ K' : 'Ctrl K'`}
            </script>
          </kbd>
        </span>
      </Button>
      <ModalOverlay
        isDismissable
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          background: 'rgba(0,0,0,0.25)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '5rem 1rem 1rem',
          textAlign: 'center',
          overflowY: 'auto',
        }}
      >
        <Modal>
          <Dialog style={{ outline: 'none', position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                width: 'min(95vw, 500px)',
                maxWidth: '100%',
                borderRadius: 12,
                background: 'var(--color-surface-interactive, #111827)',
                boxShadow:
                  '0 4px 10px -2px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.04)',
                padding: 8,
              }}
            >
              <Autocomplete filter={contains}>
                <TextField
                  aria-label="Search documentation"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    padding: '0.5rem 0.25rem',
                  }}
                >
                  <SearchIcon
                    style={{
                      position: 'absolute',
                      left: '1rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 16,
                      height: 16,
                      color: 'var(--color-foreground-interactive, #9ca3af)',
                    }}
                  />
                  <Input
                    autoFocus
                    placeholder="Search documentation..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                      fontSize: '1rem',
                      lineHeight: '1.25rem',
                      color: 'var(--color-foreground, #ffffff)',
                      background:
                        'var(--color-surface-secondary, rgba(0,0,0,0.05))',
                      border: '1px solid var(--color-separator, transparent)',
                      borderRadius: 8,
                      outline: 'none',
                    }}
                  />
                </TextField>
                {filteredEntries.length ? (
                  <Menu
                    aria-label="Search results"
                    selectionMode="single"
                    onAction={(key) => {
                      const entry = filteredEntries.find(
                        (item) => item.pathname === key
                      )
                      if (!entry) return
                      router.push(entry.pathname)
                      setOpen(false)
                    }}
                    style={{
                      marginTop: 8,
                      padding: 4,
                      maxHeight: '11rem',
                      overflow: 'auto',
                    }}
                    items={groupedEntries}
                  >
                    {(group) => (
                      <Section id={group.category} aria-label={group.category}>
                        <Header
                          style={{
                            fontSize: '0.625rem',
                            letterSpacing: '0.05em',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            padding: '0.5rem 0.75rem 0.25rem',
                            color:
                              'var(--color-foreground-interactive, #9ca3af)',
                            opacity: 0.9,
                            textAlign: 'left',
                          }}
                        >
                          {group.category}
                        </Header>
                        {group.items.map((item) => (
                          <MenuItem
                            key={item.pathname}
                            id={item.pathname}
                            textValue={item.title}
                            style={({ isFocused, isSelected }) => ({
                              display: 'flex',
                              width: '100%',
                              alignItems: 'center',
                              borderRadius: 6,
                              padding: '0.5rem 0.75rem',
                              boxSizing: 'border-box',
                              cursor: 'default',
                              userSelect: 'none',
                              color: 'var(--color-foreground, #ffffff)',
                              background: isSelected
                                ? 'var(--color-surface-primary, rgba(255,255,255,0.12))'
                                : isFocused
                                  ? 'var(--color-surface-interactive-highlighted, rgba(255,255,255,0.08))'
                                  : 'transparent',
                              transition: 'background 120ms ease',
                            })}
                          >
                            {item.title}
                          </MenuItem>
                        ))}
                      </Section>
                    )}
                  </Menu>
                ) : (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '1rem 0.75rem',
                      fontSize: '0.875rem',
                      color: 'var(--color-foreground-interactive, #6b7280)',
                    }}
                  >
                    No matches found.
                  </div>
                )}
              </Autocomplete>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  )
}

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M5 9.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM10.5 10.5L8 8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
