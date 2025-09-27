declare global {
  interface Window {
    __TableOfContents__: {
      register: (ids: string[]) => void
      isDelegated: boolean
    }
  }
}

/**
 * Script to manage active heading state in the table of contents.
 * @internal
 */
export default function (): void {
  if (!window.__TableOfContents__) {
    window.__TableOfContents__ = {
      register: () => {},
      isDelegated: false,
    }
  }

  let observer: IntersectionObserver | null = null
  let isManualScrolling = false
  let links: Map<string, HTMLAnchorElement | null> = new Map()
  let visibility: Map<string, number> = new Map()
  let rafId = 0
  let lastScrollY = 0
  let activeId: string | null = null
  const currentIds = new Set<string>()

  function cancelFrame(): void {
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
  }

  function setActive(id: string | null): void {
    if (!id || id === activeId) return
    activeId = id
    for (const [key, element] of links) {
      if (!element) continue
      if (key === id) element.setAttribute('aria-current', 'location')
      else element.removeAttribute('aria-current')
    }
  }

  function pickBestVisible(): string | null {
    let best: string | null = null
    let bestRatio = 0
    for (const [id, ratio] of visibility) {
      if (ratio > bestRatio) {
        best = id
        bestRatio = ratio
      }
    }
    return bestRatio > 0 ? best : null
  }

  function reset(): void {
    cancelFrame()
    if (observer) observer.disconnect()
    observer = null
    activeId = null
    isManualScrolling = false
    currentIds.clear()
    links.clear()
    visibility.clear()
  }

  function observe(ids: string[]): void {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id
          visibility.set(id, entry.isIntersecting ? entry.intersectionRatio : 0)
        }
        if (isManualScrolling) return
        setActive(pickBestVisible())
      },
      {
        root: null,
        rootMargin: '0px 0px -66.6% 0px',
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      }
    )
    for (const id of ids) {
      const section = document.getElementById(id)
      if (section) observer.observe(section)
    }
  }

  function delegate(): void {
    document.addEventListener('click', (event) => {
      const targetNode = event.target
      if (!(targetNode instanceof Element)) return

      const link = targetNode.closest<HTMLAnchorElement>('a[href^="#"]')
      if (!link) return

      const rawId = link.hash ? decodeURIComponent(link.hash.slice(1)) : ''
      if (!rawId || !currentIds.has(rawId)) return

      const sameDocument =
        (link.origin === location.origin || !link.origin) &&
        (link.pathname === location.pathname || link.pathname === '')
      if (!sameDocument) return

      const section = document.getElementById(rawId)
      if (!section) return

      event.preventDefault()
      history.pushState(null, '', '#' + rawId)
      setActive(rawId)

      isManualScrolling = true
      if ('onscrollend' in window) {
        window.addEventListener(
          'scrollend',
          () => {
            isManualScrolling = false
          },
          { passive: true, once: true } as AddEventListenerOptions
        )
      } else {
        cancelFrame()
        let stillCount = 0
        const step = (): void => {
          const y = window.scrollY
          if (Math.abs(y - lastScrollY) < 1) {
            stillCount++
            if (stillCount > 4) {
              isManualScrolling = false
              cancelFrame()
              return
            }
          } else {
            stillCount = 0
          }
          lastScrollY = y
          rafId = requestAnimationFrame(step)
        }
        rafId = requestAnimationFrame(step)
      }

      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function bootstrapActive(ids: string[]): void {
    const hashId = decodeURIComponent(location.hash.slice(1))
    if (hashId && ids.includes(hashId)) {
      setActive(hashId)
      return
    }
    let bestId: string | null = null
    let bestDistance = 1e12
    for (const id of ids) {
      const element = document.getElementById(id)
      if (!element) continue
      const top = element.getBoundingClientRect().top
      const distance = Math.abs(top)
      if (distance < bestDistance) {
        bestDistance = distance
        bestId = id
      }
    }
    if (bestId) setActive(bestId)
  }

  function register(ids: string[]): void {
    reset()
    for (const id of ids) currentIds.add(id)

    function select(id: string) {
      return document.querySelector<HTMLAnchorElement>(
        'a[href="#' + CSS.escape(id) + '"]'
      )
    }
    for (const id of ids) {
      links.set(id, select(id))
    }
    visibility = new Map(ids.map((id) => [id, 0]))

    observe(ids)
    bootstrapActive(ids)

    if (window.__TableOfContents__?.isDelegated === false) {
      delegate()
      window.__TableOfContents__!.isDelegated = true
    }
  }

  window.__TableOfContents__!.register = register
}
