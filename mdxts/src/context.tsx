'use client'
import React, { createContext } from 'react'
import { type CodeBlocks } from './remark'

const MdxtsContext = createContext<{ codeBlocks: CodeBlocks } | null>(null)

export function MdxtsProvider({ value, children }) {
  return <MdxtsContext.Provider value={value}>{children}</MdxtsContext.Provider>
}

export function useMdxtsContext() {
  const context = React.useContext(MdxtsContext)

  if (context === null) {
    throw new Error('useMdxtsContext must be used within a MdxtsProvider')
  }

  return context
}
