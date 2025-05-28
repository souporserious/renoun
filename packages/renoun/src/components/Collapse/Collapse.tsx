'use client'
import React, { createContext, use, useId, useMemo, useState } from 'react'

const CollapseContext = createContext<
  | {
      triggerId: string
      contentId: string
      isOpen: boolean
      toggle: () => void
    }
  | undefined
>(undefined)

function useCollapse() {
  const context = use(CollapseContext)
  if (!context) {
    throw new Error('useCollapse must be used within a CollapseProvider')
  }
  return context
}

export function Provider({
  defaultOpen = false,
  children,
}: {
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const triggerId = useId()
  const contentId = useId()
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <CollapseContext
      value={{
        triggerId,
        contentId,
        isOpen,
        toggle: () => setIsOpen((currentIsOpen) => !currentIsOpen),
      }}
    >
      {children}
    </CollapseContext>
  )
}

export function Trigger<As extends React.ElementType = 'button'>({
  as,
  children,
  ...props
}: {
  as?: As
} & React.ComponentPropsWithoutRef<As>) {
  const Component = as || 'button'
  const { triggerId, contentId, isOpen, toggle } = useCollapse()

  return (
    <Component
      id={triggerId}
      aria-expanded={isOpen}
      aria-controls={contentId}
      onClick={toggle}
      {...props}
    >
      {children}
    </Component>
  )
}

export function Content<As extends React.ElementType = 'div'>({
  as,
  children,
  ...props
}: {
  as?: As
} & React.HTMLAttributes<HTMLDivElement>) {
  const Component = as || 'div'
  const { isOpen, triggerId, contentId } = useCollapse()

  return (
    <Component
      id={contentId}
      aria-labelledby={triggerId}
      hidden={!isOpen}
      style={
        {
          width: '100%',
          display: 'block',
          height: isOpen ? 'auto' : 0,
          opacity: isOpen ? 1 : 0,
          overflow: 'hidden',
          transition: `height 0.3s ease, opacity 0.5s ease, content-visibility 0.3s`,
          transitionBehavior: 'allow-discrete',
          interpolateSize: 'allow-keywords',
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </Component>
  )
}
