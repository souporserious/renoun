'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'

import { Collapse } from '../Collapse'

function normalizePathname(pathname: string) {
  if (!pathname) {
    return '/'
  }
  if (pathname === '/') {
    return pathname
  }
  return pathname.replace(/\/$/, '')
}

const SidebarCollapseDisableAnimationContext = createContext(false)

function useDisableAnimation() {
  return useContext(SidebarCollapseDisableAnimationContext)
}

let hasHydrated = false

function isDescendantPath(pathname: string, basePathname: string) {
  const normalizedPath = normalizePathname(pathname)
  const normalizedBase = normalizePathname(basePathname)

  return (
    normalizedPath === normalizedBase ||
    normalizedPath.startsWith(normalizedBase + '/')
  )
}

export function SidebarCollapseProvider({
  pathname,
  children,
}: {
  pathname: string
  children: ReactNode
}) {
  const basePathname = normalizePathname(pathname)
  const activePathname = normalizePathname(usePathname() ?? '/')
  const previousActivePathnameRef = useRef<string | null>(null)
  const shouldBeOpen = useMemo(
    () =>
      activePathname === basePathname ||
      activePathname.startsWith(basePathname + '/'),
    [activePathname, basePathname]
  )

  const [disableAnimation, setDisableAnimation] = useState(
    () => !hasHydrated && shouldBeOpen
  )

  const shouldDisableForActiveChange =
    hasHydrated &&
    shouldBeOpen &&
    previousActivePathnameRef.current !== null &&
    previousActivePathnameRef.current !== activePathname &&
    isDescendantPath(previousActivePathnameRef.current, basePathname)

  useEffect(() => {
    hasHydrated = true
  }, [])

  useEffect(() => {
    if (shouldDisableForActiveChange) {
      setDisableAnimation(true)
    }
  }, [shouldDisableForActiveChange])

  useEffect(() => {
    if (!disableAnimation) {
      return
    }

    const id = requestAnimationFrame(() => {
      setDisableAnimation(false)
    })

    return () => cancelAnimationFrame(id)
  }, [disableAnimation])

  useEffect(() => {
    previousActivePathnameRef.current = activePathname
  }, [activePathname])

  const providerKey = useMemo(
    () => `${basePathname}-${shouldBeOpen ? 'open' : 'closed'}`,
    [basePathname, shouldBeOpen]
  )

  return (
    <SidebarCollapseDisableAnimationContext.Provider value={disableAnimation}>
      <Collapse.Provider key={providerKey} defaultOpen={shouldBeOpen}>
        {children}
      </Collapse.Provider>
    </SidebarCollapseDisableAnimationContext.Provider>
  )
}

type SidebarCollapseContentProps = ComponentProps<typeof Collapse.Content>

export function SidebarCollapseContent({
  css,
  ...props
}: SidebarCollapseContentProps) {
  const disableAnimation = useDisableAnimation()

  return (
    <Collapse.Content
      {...props}
      css={{
        ...(disableAnimation ? { transition: 'none !important' } : {}),
        ...css,
      }}
    />
  )
}
