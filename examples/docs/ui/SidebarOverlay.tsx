'use client'
import { useState } from 'react'

export function SidebarOverlay({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        className={`fixed top-4 left-4 z-50 md:hidden p-2 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow transition-transform ${open ? 'translate-x-64' : ''}`}
        aria-label={open ? 'Close sidebar' : 'Open sidebar'}
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>

      <div
        className={`fixed inset-0 z-40 bg-black bg-opacity-40 transition-opacity md:hidden ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />
      <aside
        className={`fixed top-0 left-0 h-screen w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-8 overflow-y-auto overscroll-contain z-50 transition-transform md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'} md:block`}
        style={{ transitionProperty: 'transform' }}
        aria-hidden={!open}
      >
        {children}
      </aside>
    </>
  )
}

function MenuIcon() {
  return (
    <svg
      width="24"
      height="24"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <line
        x1="4"
        y1="7"
        x2="20"
        y2="7"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="4"
        y1="12"
        x2="20"
        y2="12"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="4"
        y1="17"
        x2="20"
        y2="17"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg
      width="24"
      height="24"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <line
        x1="6"
        y1="6"
        x2="18"
        y2="18"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="18"
        y1="6"
        x2="6"
        y2="18"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
