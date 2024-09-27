'use client'
import { useEffect, useRef, useMemo } from 'react'
import { Signal, signal, effect } from '@preact/signals-core'

import { useSignalValue } from './use-signal-value'

/** Returns a callback for scrolling to a section id and a hook for tracking the active section id. */
export function useSectionObserver({
  rootMargin,
}: { rootMargin?: string } = {}) {
  const activeSectionId = useRef<Signal<string | null> | null>(null)
  const isManualScrolling = useRef(false)
  const scrollEndListener = useRef<(() => void) | null>(null)
  const observer = useRef<IntersectionObserver | null>(null)
  const sections = useRef<Map<string, IntersectionObserverEntry | null>>(
    new Map()
  )

  if (activeSectionId.current === null) {
    activeSectionId.current = signal<string | null>(null)
  }

  if (
    observer.current === null &&
    typeof IntersectionObserver !== 'undefined'
  ) {
    observer.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          sections.current.set(entry.target.id, entry)
        })

        if (isManualScrolling.current) {
          return
        }

        const firstIntersectingEntry = Array.from(
          sections.current.values()
        ).find((entry) => entry?.isIntersecting)

        if (firstIntersectingEntry) {
          activeSectionId.current!.value = firstIntersectingEntry.target.id
        }
      },
      { rootMargin, threshold: [0, 1] }
    )
  }

  useEffect(() => {
    return () => {
      observer.current?.disconnect()
    }
  }, [])

  return useMemo(() => {
    function scrollToSection(sectionId: string): void {
      const section = document.getElementById(sectionId)

      if (!section) {
        return
      }

      activeSectionId.current!.value = sectionId
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.history.pushState(null, '', `#${sectionId}`)

      if ('onscrollend' in window) {
        if (scrollEndListener.current) {
          window.removeEventListener('scrollend', scrollEndListener.current)
        }

        isManualScrolling.current = true

        requestAnimationFrame(() => {
          scrollEndListener.current = (): void => {
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
      useEffect(() => {
        const element = document.getElementById(id)!
        const intersectionObserver = observer.current

        if (!intersectionObserver || !element) {
          return
        }

        intersectionObserver.observe(element)

        return () => {
          intersectionObserver.unobserve(element)
        }
      }, [])

      return useSignalValue(activeSectionId.current!) === id
    }

    function useLink(id: string) {
      const isActive = useSection(id)

      useEffect(() => {
        return effect(() => {
          const isActive = activeSectionId.current?.value === id
          const element = document.querySelector(`a[href="#${id}"]`)

          if (isActive && element) {
            const isSafari = /^((?!chrome|android).)*safari/i.test(
              navigator.userAgent
            )
            const viewport = getClosestViewport(element as HTMLElement)
            const allLinks = Array.from(
              viewport.querySelectorAll('a[href^="#"]')
            )
            const currentIndex = allLinks.indexOf(element)
            const isFirstLink = currentIndex === 0
            const isLastLink = currentIndex === allLinks.length - 1

            if (isFirstLink || isLastLink) {
              viewport.scrollTo({
                top: isLastLink ? viewport.scrollHeight : 0,
                behavior: isSafari ? 'instant' : 'smooth',
              })
            } else {
              element.scrollIntoView({
                behavior: isSafari ? 'instant' : 'smooth',
                block: 'nearest',
              })
            }
          }
        })
      }, [])

      return [
        activeSectionId.current!.value === null ? null : isActive,
        {
          href: `#${id}`,
          onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault()
            scrollToSection(id)
          },
        },
      ] as const
    }

    return {
      scrollToSection,
      useSection,
      useLink,
    }
  }, [])
}

/** Get the closest scrollable viewport of a node. */
function getClosestViewport(node: HTMLElement) {
  let scrollableNode: ParentNode | null = node.parentNode

  while (scrollableNode) {
    if (scrollableNode === document.body) {
      return document.body
    }
    const { overflow, overflowX, overflowY } = getComputedStyle(
      scrollableNode as HTMLElement
    )
    const canScroll = /(auto|scroll|hidden)/.test(
      overflow + overflowX + overflowY
    )
    if (canScroll) {
      return scrollableNode as HTMLElement
    }
    scrollableNode = scrollableNode.parentNode
  }

  return document.body
}
