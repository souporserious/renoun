'use client'
import React, { createContext, cloneElement, isValidElement } from 'react'

import { useSectionObserver } from '../../hooks/use-section-observer.js'

const SectionObserverContext = createContext<ReturnType<
  typeof useSectionObserver
> | null>(null)

/**
 * Hook to access the section observer context.
 * @internal
 */
export function useContext() {
  const context = React.useContext(SectionObserverContext)
  if (!context) {
    throw new Error(
      '[renoun] SectionObserver.useContext must be used within a SectionObserver.Provider'
    )
  }
  return context
}

/**
 * Provides the section observer context to descendant components.
 * @internal
 */
export function Provider({ children }: { children: React.ReactNode }) {
  const sectionObserver = useSectionObserver()
  return (
    <SectionObserverContext value={sectionObserver}>
      {children}
    </SectionObserverContext>
  )
}

/**
 * A link that observes section visibility and updates its active state accordingly.
 * @internal
 */
export function Link({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) {
  const sectionObserver = useContext()
  const linkProps = sectionObserver.useLink(id)
  return (
    <>
      {isValidElement(children) ? cloneElement(children, linkProps) : null}
      <script>{`window.isSectionLinkActive?.('${id}')`}</script>
    </>
  )
}
