'use client'
import { useState } from 'react'

export function SidebarOverlay({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 md:hidden h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center">
        <div className="flex-1" />
        <button
          className="mr-4 p-2 rounded border border-gray-200 dark:border-gray-700"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden bg-white dark:bg-gray-900">
          <aside className="h-full w-full overflow-y-auto overscroll-contain p-4 pt-20">
            {children}
          </aside>
        </div>
      ) : null}
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
