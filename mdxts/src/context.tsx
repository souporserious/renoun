'use client'
import React, { createContext } from 'react'
import { type CodeBlocks } from './remark'

const MdxtsContext = createContext<{ codeBlocks: CodeBlocks }>({
  codeBlocks: [],
})

export function MdxtsProvider({ value, children }) {
  return <MdxtsContext.Provider value={value}>{children}</MdxtsContext.Provider>
}

export function useMdxtsContext() {
  return React.useContext(MdxtsContext)
}
