declare global {
  interface Window {
    __TableOfContents__: {
      register: (ids: string[]) => void
    }
  }
}

/**
 * Script to manage active target state in the table of contents.
 * @internal
 */
export default function ({
  activationRatio = 0.333,
}: {
  /** A number between `0` and `1` representing which portion of the viewport height from top the target becomes active. */
  activationRatio?: number
}): void {
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches
  const smoothScrollBehavior: ScrollBehavior = prefersReducedMotion
    ? 'auto'
    : 'smooth'
  let previousActiveLink: HTMLAnchorElement | null = null
  let isScrollingIntoView = false
  let lastScrollY = 0
  let rafId = 0

  function cancelFrame(): void {
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
  }

  function getLink(id: string): HTMLAnchorElement | null {
    return document.querySelector<HTMLAnchorElement>(
      `:is(ol, ul) a[href="#${id}"]`
    )
  }

  function getClosestViewport(node: HTMLElement): HTMLElement {
    let current: ParentNode | null = node.parentNode
    while (current) {
      if (current === document.body) return document.body as HTMLElement
      const element = current as HTMLElement
      const { overflow, overflowX, overflowY } = getComputedStyle(element)
      if (/(auto|scroll)/.test(overflow + overflowX + overflowY)) {
        return element
      }
      current = element.parentNode
    }
    return document.body as HTMLElement
  }

  function setActiveLink(target: HTMLElement): void {
    isScrollingIntoView = true
    const nextActiveLink = getLink(target.id)
    if (nextActiveLink) {
      nextActiveLink.setAttribute('aria-current', 'location')
      if (previousActiveLink) {
        previousActiveLink.removeAttribute('aria-current')
      }
      previousActiveLink = nextActiveLink
    }

    if ('onscrollend' in window) {
      window.addEventListener(
        'scrollend',
        () => {
          isScrollingIntoView = false
        },
        { passive: true, once: true }
      )
    } else {
      cancelFrame()
      let stillCount = 0
      const step = (): void => {
        const y = window.scrollY
        if (Math.abs(y - lastScrollY) < 1) {
          stillCount++
          if (stillCount > 4) {
            isScrollingIntoView = false
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
  }

  document.addEventListener(
    'click',
    (event) => {
      if (!(event.target instanceof HTMLAnchorElement)) return
      const href = event.target.href
      if (!href?.includes('#')) return
      const id = href.slice(href.indexOf('#') + 1)
      const section = document.getElementById(id)
      if (!section) return
      setActiveLink(section)
    },
    { passive: true }
  )

  window.__TableOfContents__ = {
    register: (targetIds: string[]) => {
      const targetElements = targetIds
        .map((id) => document.getElementById(id))
        .filter(Boolean) as HTMLElement[]

      if (targetElements.length === 0) return

      const linkForHeading = new Map<HTMLElement, HTMLAnchorElement | null>(
        targetElements.map((target) => [target, getLink(target.id)])
      )

      function update(): void {
        if (isScrollingIntoView) return

        const offsetTop = window.innerHeight * activationRatio
        let bestIndex = 0
        let bestTop = -Infinity

        for (let index = 0; index < targetElements.length; index++) {
          const target = targetElements[index]
          const { top } = target.getBoundingClientRect()

          if (top <= offsetTop) {
            if (top > bestTop) {
              bestTop = top
              bestIndex = index
            }
            continue
          }
        }

        const targetElement = targetElements[bestIndex]
        const nextActiveLink = linkForHeading.get(targetElement)
        const lastIndex = targetElements.length - 1

        if (nextActiveLink !== previousActiveLink) {
          if (previousActiveLink) {
            previousActiveLink.removeAttribute('aria-current')
          }
          if (nextActiveLink) {
            nextActiveLink.setAttribute('aria-current', 'location')

            // Keep the active link visible within its scrollable container.
            const viewport = getClosestViewport(nextActiveLink)
            if (bestIndex === lastIndex) {
              viewport.scrollTo({
                top: viewport.scrollHeight,
                behavior: smoothScrollBehavior,
              })
            } else {
              nextActiveLink.scrollIntoView({
                behavior: smoothScrollBehavior,
                block: 'nearest',
              })
            }
          }
          previousActiveLink = nextActiveLink ?? null
        }
      }

      const intersectionObserver = new IntersectionObserver(update, {
        root: null,
        rootMargin: `-${activationRatio * 100}% 0px 0px 0px`,
        threshold: [0, 1],
      })

      targetElements.forEach((target) => intersectionObserver.observe(target))

      update()
    },
  }
}
