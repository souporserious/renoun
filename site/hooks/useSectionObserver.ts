'use client'
import { useEffect, useRef, useMemo } from 'react'
import { Signal, signal } from '@preact/signals-core'

import { useSignalValue } from './useSignal'

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

  return useMemo(
    () => ({
      scrollToSection: (sectionId: string): void => {
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
      },
      useActiveSection: (id: string) => {
        useEffect(() => {
          const element = document.getElementById(id)
          const intersectionObserver = observer.current

          if (!intersectionObserver || !element) {
            return
          }

          intersectionObserver.observe(element)

          return () => {
            intersectionObserver.unobserve(element)
          }
        }, [id])

        return useSignalValue(activeSectionId.current!) === id
      },
    }),
    []
  )
}
