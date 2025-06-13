'use client'
import React, {
  createContext,
  use,
  useId,
  useEffect,
  useRef,
  useState,
} from 'react'
import { usePathname } from 'next/navigation'

export const Context = createContext<
  | {
      triggerId: string
      contentId: string
      isOpen: boolean
      toggle: () => void
    }
  | undefined
>(undefined)

function useCollapse() {
  const context = use(Context)
  if (!context) {
    throw new Error('useCollapse must be used within a CollapseProvider')
  }
  return context
}

export function Provider({
  pathname,
  children,
}: {
  pathname: string
  children: React.ReactNode
}) {
  const triggerId = useId()
  const contentId = useId()
  const activePathname = usePathname()
  const [isOpen, setIsOpen] = useState(
    activePathname === pathname || activePathname.startsWith(pathname + '/')
  )

  return (
    <Context
      value={{
        triggerId,
        contentId,
        isOpen,
        toggle: () => setIsOpen((currentIsOpen) => !currentIsOpen),
      }}
    >
      {children}
    </Context>
  )
}

export function Trigger() {
  const { triggerId, contentId, isOpen, toggle } = useCollapse()

  return (
    <button
      id={triggerId}
      aria-expanded={isOpen}
      aria-controls={contentId}
      onClick={toggle}
      className={`order-1 group w-6 h-6 flex items-center justify-center text-black dark:text-gray-100 hover:bg-white/20 dark:hover:bg-white/10 focus-visible:bg-violet-200 dark:focus-visible:bg-blue-400/40 rounded transition-colors border-0 bg-transparent outline-0 -m-1`}
      aria-label="Toggle children"
    >
      <svg
        viewBox="0 0 16 16"
        className="w-4 h-4 transition-transform duration-200 ease-in-out group-aria-expanded:rotate-90"
      >
        <path
          d="M6 3l4 5-4 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

export function Content({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { isOpen, triggerId, contentId } = useCollapse()
  const initialRender = useRef(true)

  useEffect(() => {
    initialRender.current = false
  }, [])

  return (
    <div
      id={contentId}
      aria-labelledby={triggerId}
      hidden={!isOpen}
      className={[
        'block rounded overflow-hidden',
        !initialRender.current && 'starting:h-0 starting:opacity-0',
        isOpen ? 'h-auto opacity-100' : 'h-0 opacity-0',
        'motion-safe:transition-[display,height,opacity]',
        'motion-safe:duration-400',
        'motion-safe:[transition-behavior:allow-discrete]',
        '[interpolate-size:allow-keywords]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
