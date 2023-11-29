'use client'
import React from 'react'

export function QuickInfoContainer(props: React.HTMLProps<HTMLDivElement>) {
  return <div {...props} onPointerDown={(event) => event.stopPropagation()} />
}
