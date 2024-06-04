'use client'
import React, { createContext } from 'react'

export const CopyButtonContext = createContext<string | null>(null)

export function CopyButtonContextProvider({
  value,
  children,
}: {
  value: string
  children: React.ReactNode
}) {
  return (
    <CopyButtonContext.Provider value={value}>
      {children}
    </CopyButtonContext.Provider>
  )
}
