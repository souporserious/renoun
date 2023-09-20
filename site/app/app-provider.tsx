'use client'

import { useServerInsertedHTML } from 'next/navigation'
import { useStyledComponentsRegistry } from 'hooks/useStyledComponentsRegistry'

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [StyledComponentsRegistry, flushEffect] = useStyledComponentsRegistry()

  useServerInsertedHTML(() => {
    return <>{flushEffect()}</>
  })

  return <StyledComponentsRegistry>{children}</StyledComponentsRegistry>
}
