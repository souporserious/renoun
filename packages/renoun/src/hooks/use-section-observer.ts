'use client'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

/** Returns a set of hooks to manage the active section in a scrollable container. */
export function useSectionObserver({
  rootMargin,
}: { rootMargin?: string } = {}) {
  const storeRef = useRef<ReturnType<typeof createStore<string | null>> | null>(
    null
  )
  if (storeRef.current === null) {
    storeRef.current = createStore<string | null>(null)
  }
  const store = storeRef.current
  const isManualScrolling = useRef(false)
  const scrollEndListener = useRef<(() => void) | null>(null)
  const observer = useRef<IntersectionObserver | null>(null)
  const sections = useRef<Map<string, IntersectionObserverEntry | null>>(
    new Map()
  )

  if (
    observer.current === null &&
    typeof IntersectionObserver !== 'undefined'
  ) {
    observer.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => sections.current.set(entry.target.id, entry))

        if (isManualScrolling.current) return

        const first = Array.from(sections.current.values()).find(
          (e) => e?.isIntersecting
        )
        if (first) store.set(first.target.id)
      },
      { rootMargin, threshold: [0, 1] }
    )
  }

  useEffect(() => () => observer.current?.disconnect(), [])

  return useMemo(() => {
    function scrollToSection(sectionId: string) {
      const section = document.getElementById(sectionId)
      if (!section) return

      store.set(sectionId)
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.history.pushState(null, '', `#${sectionId}`)

      if ('onscrollend' in window) {
        if (scrollEndListener.current) {
          window.removeEventListener('scrollend', scrollEndListener.current)
        }
        isManualScrolling.current = true

        requestAnimationFrame(() => {
          scrollEndListener.current = () => {
            isManualScrolling.current = false
            scrollEndListener.current = null
          }
          window.addEventListener('scrollend', scrollEndListener.current, {
            passive: true,
            once: true,
          })
        })
      }
    }

    function useSection(id: string) {
      /* Observe/un-observe the element */
      useEffect(() => {
        const element = document.getElementById(id)
        const io = observer.current
        if (!io || !element) return
        io.observe(element)
        return () => io.unobserve(element)
      }, [id])

      /* Re-render when active id changes */
      const activeId = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getSnapshot
      )
      return activeId === id
    }

    function useLink(id: string) {
      const isActive = useSection(id)
      const activeId = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getSnapshot
      )

      /* Keep active link visible in its scroll container */
      useEffect(() => {
        if (activeId !== id) return

        const anchor = document.querySelector(
          `a[href="#${id}"]`
        ) as HTMLElement | null

        if (!anchor) return

        const isSafari = /^((?!chrome|android).)*safari/i.test(
          navigator.userAgent
        )
        const viewport = getClosestViewport(anchor)
        const links = Array.from(viewport.querySelectorAll('a[href^="#"]'))
        const idx = links.indexOf(anchor)
        const first = idx === 0
        const last = idx === links.length - 1

        if (first || last) {
          viewport.scrollTo({
            top: last ? viewport.scrollHeight : 0,
            behavior: isSafari ? 'instant' : 'smooth',
          })
        } else {
          anchor.scrollIntoView({
            behavior: isSafari ? 'instant' : 'smooth',
            block: 'nearest',
          })
        }
      }, [activeId, id])

      const props: React.AnchorHTMLAttributes<HTMLAnchorElement> = {
        href: `#${id}`,
        suppressHydrationWarning: true,
        onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
          event.preventDefault()
          scrollToSection(id)
        },
      }

      if (store.getSnapshot() === null ? null : isActive) {
        props['aria-current'] = 'location'
      }

      return props
    }

    return { scrollToSection, useSection, useLink }
  }, [])
}

/** Create a store to manage the active section. */
function createStore<Value>(initial: Value) {
  const listeners = new Set<() => void>()
  let current = initial

  function getSnapshot() {
    return current
  }

  function set(next: Value) {
    if (Object.is(next, current)) return
    current = next
    listeners.forEach((listener) => listener())
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return { getSnapshot, subscribe, set }
}

/** Get the closest scrollable viewport of a node. */
function getClosestViewport(node: HTMLElement): HTMLElement {
  let current: ParentNode | null = node.parentNode
  while (current) {
    if (current === document.body) return document.body as HTMLElement
    const { overflow, overflowX, overflowY } = getComputedStyle(
      current as HTMLElement
    )
    if (/(auto|scroll|hidden)/.test(overflow + overflowX + overflowY)) {
      return current as HTMLElement
    }
    current = current.parentNode
  }
  return document.body as HTMLElement
}
