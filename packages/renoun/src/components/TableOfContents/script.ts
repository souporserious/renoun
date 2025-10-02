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
  let previousLastSectionInView = false
  let isScrollingIntoView = false
  let lastScrollY = 0
  let rafId = 0
  let dispose: (() => void) | null = null

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
      if (/(auto|scroll)/.test(overflow + overflowX + overflowY)) return element
      current = element.parentNode
    }
    return document.body as HTMLElement
  }

  function setActiveLink(target: HTMLElement): void {
    isScrollingIntoView = true
    target.scrollIntoView({ behavior: smoothScrollBehavior, block: 'start' })

    const nextActiveLink = getLink(target.id)
    if (nextActiveLink) {
      nextActiveLink.setAttribute('aria-current', 'location')
      history.pushState(null, '', '#' + target.id)
      if (previousActiveLink) previousActiveLink.removeAttribute('aria-current')
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
      let still = 0
      function step(): void {
        const y = window.scrollY
        if (Math.abs(y - lastScrollY) < 1) {
          if (++still > 4) {
            isScrollingIntoView = false
            cancelFrame()
            return
          }
        } else {
          still = 0
        }
        lastScrollY = y
        rafId = requestAnimationFrame(step)
      }
      rafId = requestAnimationFrame(step)
    }
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLAnchorElement)) return
    const href = event.target.href
    if (!href?.includes('#')) return
    const id = href.slice(href.indexOf('#') + 1)
    const section = document.getElementById(id)
    if (!section) return
    event.preventDefault()
    setActiveLink(section)
  })

  window.__TableOfContents__ = {
    register: (targetIds: string[]) => {
      dispose?.()

      const targetElements = targetIds
        .map((id) => document.getElementById(id))
        .filter(Boolean) as HTMLElement[]
      const linkFor = new Map<HTMLElement, HTMLAnchorElement | null>(
        targetElements.map((target) => [target, getLink(target.id)])
      )
      const lastIndex = targetElements.length - 1
      const lastTarget = targetElements[lastIndex]
      const lastLink = lastTarget ? linkFor.get(lastTarget) : null

      function update(): void {
        if (isScrollingIntoView) return

        const vh = window.innerHeight || document.documentElement.clientHeight
        const vw = window.innerWidth || document.documentElement.clientWidth
        const offsetTop = vh * activationRatio
        let bestIndex = 0
        let bestTop = -Infinity
        let lastSectionInView = false

        for (let index = 0; index < targetElements.length; index++) {
          const rect = targetElements[index].getBoundingClientRect()

          if (rect.top <= offsetTop && rect.top > bestTop) {
            bestTop = rect.top
            bestIndex = index
          }

          if (
            index === lastIndex &&
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < vh &&
            rect.left < vw
          ) {
            lastSectionInView = true
          }
        }

        const targetElement = targetElements[bestIndex]
        const nextActiveLink = linkFor.get(targetElement) ?? null

        if (nextActiveLink !== previousActiveLink) {
          if (previousActiveLink) {
            previousActiveLink.removeAttribute('aria-current')
          }
          if (nextActiveLink) {
            nextActiveLink.setAttribute('aria-current', 'location')
          }
          previousActiveLink = nextActiveLink
        }

        if (lastSectionInView) {
          if (
            !previousLastSectionInView &&
            bestIndex !== lastIndex &&
            lastLink
          ) {
            const viewport = getClosestViewport(lastLink)
            viewport.scrollTo({
              top: viewport.scrollHeight,
              behavior: smoothScrollBehavior,
            })
          }
        } else if (previousActiveLink) {
          previousActiveLink.scrollIntoView({
            behavior: smoothScrollBehavior,
            block: 'nearest',
          })
        }
        previousLastSectionInView = lastSectionInView
      }

      const intersectionObserver = new IntersectionObserver(update, {
        root: null,
        rootMargin: `-${activationRatio * 100}% 0px 0px 0px`,
        threshold: [0, 1],
      })

      targetElements.forEach((target) => intersectionObserver.observe(target))

      update()

      dispose = () => {
        intersectionObserver.disconnect()
        cancelFrame()
        isScrollingIntoView = false
        previousLastSectionInView = false
        if (previousActiveLink) {
          previousActiveLink.removeAttribute('aria-current')
          previousActiveLink = null
        }
      }
    },
  }
}
