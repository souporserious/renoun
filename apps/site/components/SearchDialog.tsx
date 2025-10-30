'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
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

const dialogTokens = {
  overlay: 'color-mix(in srgb, var(--color-background) 75%, transparent)',
  overlayBlur: '10px',
  panelBackground: 'var(--color-surface)',
  panelBorder: 'var(--color-separator-secondary)',
  inputBackground: 'var(--color-surface-interactive)',
  inputBorder: 'var(--color-separator-interactive)',
  inputText: 'var(--color-foreground-interactive)',
  textPrimary: 'var(--color-foreground)',
  textSecondary: 'var(--color-foreground-secondary)',
  textMuted:
    'color-mix(in srgb, var(--color-foreground-interactive) 70%, transparent)',
  labelMuted: 'var(--color-foreground-interactive)',
  triggerBackground: 'var(--color-surface-secondary)',
  triggerBorder: 'var(--color-separator-secondary)',
  triggerText: 'var(--color-foreground-interactive)',
  kbdBackground: 'var(--color-surface-interactive)',
  kbdText: 'var(--color-foreground-secondary)',
  listBackgroundHover: 'var(--color-surface-interactive)',
  listBackgroundActive: 'var(--color-surface-interactive-highlighted)',
  listDivider: `color-mix(in srgb, var(--color-separator-secondary) 65%, transparent)`,
  highlightBackground: `color-mix(in srgb, var(--color-surface-accent) 35%, transparent)`,
}

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
    const trimmed = searchQuery.trim()
    if (!trimmed) {
      return routes
    }

    const terms = trimmed.toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) {
      return routes
    }

    type RankedRoute = { route: SearchRoute; score: number; index: number }

    const scored: RankedRoute[] = routes.map((route, index) => ({
      route,
      score: getRouteScore(route, terms),
      index,
    }))

    return scored
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score
        return a.index - b.index
      })
      .map((entry) => entry.route)
  }, [routes, searchQuery])

  const highlightTerms = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase()
    if (!trimmed) return [] as string[]
    return trimmed.split(/\s+/).filter(Boolean)
  }, [searchQuery])

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
    return Array.from(map.entries()).map(([category, items], index) => ({
      category,
      items,
      index,
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
        style={({ isFocusVisible }) => ({
          display: 'flex',
          alignItems: 'center',
          height: '2.25rem',
          borderRadius: 8,
          background: dialogTokens.triggerBackground,
          color: dialogTokens.triggerText,
          padding: '0 0.75rem',
          fontSize: '.875rem',
          lineHeight: '1.25rem',
          fontWeight: 500,
          fontFamily: 'inherit',
          gap: '0.5rem',
          cursor: 'default',
          outline: 'none',
          border: `1px solid ${dialogTokens.triggerBorder}`,
          boxShadow: isFocusVisible
            ? '0 0 0 2px var(--color-background), 0 0 0 4px var(--color-foreground-interactive)'
            : 'none',
        })}
      >
        <SearchIcon
          style={{
            width: '1rem',
            height: '1rem',
            color: dialogTokens.textMuted,
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
              background: dialogTokens.kbdBackground,
              color: dialogTokens.kbdText,
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
          background: dialogTokens.overlay,
          backdropFilter: `blur(${dialogTokens.overlayBlur})`,
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
          <style>{`
            .search-dialog-input::placeholder {
              color: color-mix(in srgb, var(--color-foreground-interactive) 70%, transparent);
              opacity: 0.85;
            }
          `}</style>
          <Dialog style={{ outline: 'none', position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                width: 'min(95vw, 500px)',
                maxWidth: '100%',
                borderRadius: 12,
                background: dialogTokens.panelBackground,
                boxShadow: '0 24px 60px rgba(2, 6, 23, 0.45)',
                border: `1px solid ${dialogTokens.panelBorder}`,
              }}
            >
              <Autocomplete filter={contains}>
                <div style={{ padding: '0.25rem 0.25rem 0' }}>
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
                        width: '1rem',
                        height: '1rem',
                        color: dialogTokens.textMuted,
                      }}
                    />
                    <Input
                      className="search-dialog-input"
                      autoFocus
                      placeholder="Search documentation..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.85rem 0.55rem 2.4rem',
                        fontSize: '1rem',
                        lineHeight: '1.25rem',
                        color: dialogTokens.inputText,
                        background: dialogTokens.inputBackground,
                        border: `1px solid ${dialogTokens.inputBorder}`,
                        borderRadius: 8,
                        outline: 'none',
                      }}
                    />
                  </TextField>
                </div>
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
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '0 0.25rem',
                      gap: '0.5rem',
                      maxHeight: 'clamp(14rem, 80vh, 32rem)',
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
                            color: dialogTokens.labelMuted,
                            textAlign: 'left',
                            borderBottom: `1px solid ${dialogTokens.listDivider}`,
                          }}
                        >
                          {group.category}
                        </Header>
                        {group.items.map((item, itemIndex) => {
                          const [primaryTitle, ...rest] =
                            item.title.split(' · ')
                          const secondaryTitle = rest.join(' · ')
                          const fallback = formatPathname(item.pathname)
                          const hasDivider = itemIndex > 0

                          return (
                            <MenuItem
                              key={item.pathname}
                              id={item.pathname}
                              textValue={item.title}
                              style={({ isFocused, isSelected }) => ({
                                display: 'flex',
                                width: '100%',
                                alignItems: 'stretch',
                                padding: '0.55rem 0.75rem',
                                boxSizing: 'border-box',
                                cursor: 'default',
                                userSelect: 'none',
                                color: dialogTokens.textPrimary,
                                boxShadow: hasDivider
                                  ? `inset 0 1px 0 ${dialogTokens.listDivider}`
                                  : 'none',
                                background: isSelected
                                  ? dialogTokens.listBackgroundActive
                                  : isFocused
                                    ? dialogTokens.listBackgroundHover
                                    : 'transparent',
                                transition: 'background 120ms ease',
                              })}
                            >
                              {({}) => (
                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.125rem',
                                    textAlign: 'left',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: '0.9375rem',
                                      lineHeight: '1.375rem',
                                      fontWeight: 600,
                                      color: dialogTokens.textPrimary,
                                    }}
                                  >
                                    {renderHighlightedText(
                                      primaryTitle,
                                      highlightTerms
                                    )}
                                    {secondaryTitle ? (
                                      <span
                                        style={{
                                          fontWeight: 500,
                                          color: dialogTokens.textSecondary,
                                        }}
                                      >
                                        {' '}
                                        &middot;{' '}
                                        {renderHighlightedText(
                                          secondaryTitle,
                                          highlightTerms
                                        )}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: '0.75rem',
                                      lineHeight: '1rem',
                                      color: dialogTokens.textMuted,
                                      textTransform: 'none',
                                    }}
                                  >
                                    {renderHighlightedText(
                                      fallback,
                                      highlightTerms
                                    )}
                                  </span>
                                </div>
                              )}
                            </MenuItem>
                          )
                        })}
                      </Section>
                    )}
                  </Menu>
                ) : (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '1rem 0.75rem',
                      fontSize: '0.875rem',
                      color: dialogTokens.textMuted,
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

function getRouteScore(route: SearchRoute, terms: string[]) {
  if (!terms.length) return 1

  let total = 0

  for (const term of terms) {
    const normalizedTerm = term.trim()
    if (!normalizedTerm) continue

    const titleScore = scoreText(route.title, normalizedTerm) * 5
    const keywordScore =
      Math.max(
        0,
        ...(route.keywords ?? []).map((keyword) =>
          scoreText(keyword, normalizedTerm)
        )
      ) * 3
    const pathScore = scoreText(route.pathname, normalizedTerm) * 2

    const bestScore = Math.max(titleScore, keywordScore, pathScore)

    if (bestScore <= 0) {
      return 0
    }

    total += bestScore
  }

  return total
}

function scoreText(text: string | undefined, term: string) {
  if (!text) return 0
  const normalized = text.toLowerCase()
  const index = normalized.indexOf(term)
  if (index === -1) return 0

  if (normalized === term) {
    return 120
  }

  if (normalized.startsWith(term)) {
    return 80
  }

  const boundary = new RegExp(
    `(?:^|[^\\w])${escapeRegExp(term)}(?:$|[^\\w])`,
    'i'
  )
  if (boundary.test(normalized)) {
    return 55
  }

  return 30
}

function renderHighlightedText(text: string, terms: string[]) {
  if (!terms.length || !text) return text

  const escaped = terms.map(escapeRegExp).filter(Boolean)
  if (!escaped.length) {
    return text
  }

  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(pattern).filter((part) => part.length > 0)

  return parts.map((part, index) => {
    const isMatch = terms.some((term) => part.toLowerCase() === term)
    if (!isMatch) {
      return <Fragment key={`${part}-${index}`}>{part}</Fragment>
    }

    return (
      <span
        key={`${part}-${index}`}
        style={{
          backgroundColor: dialogTokens.highlightBackground,
          color: dialogTokens.textPrimary,
          borderRadius: 4,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 0.125rem',
          minWidth: '0.625rem',
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
        }}
      >
        {part}
      </span>
    )
  })
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatPathname(pathname: string) {
  const cleaned = pathname.replace(/^\//, '')
  if (!cleaned) return '/'
  const [withoutHash] = cleaned.split('#')
  if (!withoutHash) return '/'
  return withoutHash
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/-/g, ' '))
    .join(' / ')
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
