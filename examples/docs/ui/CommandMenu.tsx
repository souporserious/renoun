'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Autocomplete,
  Button,
  Dialog,
  DialogTrigger,
  Input,
  Menu,
  MenuItem,
  Modal,
  ModalOverlay,
  TextField,
  useFilter,
} from 'react-aria-components'

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M5 9.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM10.5 10.5L8 8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CommandMenu({
  routes,
}: {
  routes: {
    title: string
    pathname: string
  }[]
}) {
  let [isOpen, setOpen] = useState(false)
  let { contains } = useFilter({ sensitivity: 'base' })
  const isMac = useMemo(
    () =>
      typeof navigator === 'undefined'
        ? false
        : /mac(os|intosh)/i.test(navigator.userAgent),
    []
  )
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const filteredEntries = routes
    .filter((entry) =>
      entry.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .map((entry) => ({ ...entry, key: entry.pathname }))

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'k' && (isMac ? event.metaKey : event.ctrlKey)) {
        event.preventDefault()
        setOpen((prev) => !prev)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  })

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setOpen}>
      <Button className="group flex items-center h-9 rounded-lg bg-gray-100 dark:bg-black/20 text-gray-700 dark:text-white/80 px-3 font-medium font-[inherit] text-sm hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 pressed:bg-gray-100 dark:pressed:bg-gray-700 transition-colors cursor-default outline-none focus-visible:bg-violet-100 dark:focus-visible:bg-blue-400/20 gap-2">
        <SearchIcon className="w-4 h-4 text-gray-400 dark:text-white/40 group-hover:text-gray-700 dark:group-hover:text-white transition-colors" />
        <span className="flex-1 text-left">Search</span>
        <span className="hidden sm:flex items-center text-xs text-gray-500 dark:text-white/60 group-hover:text-gray-700 dark:group-hover:text-white transition-colors">
          <kbd className="h-5 px-2 font-semibold rounded text-xs bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-white/60 group-hover:text-gray-700 dark:group-hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-blue-400 flex items-center justify-center transition-colors">
            {isMac ? '⌘ K' : 'Ctrl K'}
          </kbd>
        </span>
      </Button>
      <ModalOverlay
        isDismissable
        className={({ isEntering, isExiting }) => `
          fixed inset-0 z-100 overflow-y-auto bg-black/25 backdrop-blur
          flex min-h-full items-start justify-center p-4 pt-20 text-center
          ${isEntering ? 'animate-fade-in' : ''}
          ${isExiting ? 'animate-fade-out' : ''}
        `}
      >
        <Modal
          className={({ isEntering, isExiting }) => `
            ${isEntering ? 'animate-zoom-in' : ''}
            ${isExiting ? 'animate-zoom-out' : ''}
          `}
        >
          <Dialog className="outline-none relative">
            <div className="flex flex-col gap-1 w-[95vw] sm:w-[500px] max-w-full rounded-xl bg-white dark:bg-gray-900 shadow-lg p-2">
              <Autocomplete filter={contains}>
                <TextField
                  aria-label="Search documentation"
                  className="flex flex-col px-1 py-2 rounded-md outline-none placeholder-gray-500 dark:placeholder-gray-400 relative"
                >
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/40" />
                  <Input
                    autoFocus
                    placeholder="Search documentation..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="w-full pl-9 pr-3 py-2 leading-5 text-gray-900 dark:text-gray-100 bg-black/20 dark:bg-black/20 outline-none text-base focus-visible:bg-violet-100 dark:focus-visible:bg-blue-400/20 rounded-lg"
                  />
                </TextField>
                <Menu
                  items={filteredEntries}
                  className="mt-2 p-1 max-h-44 overflow-auto"
                  onAction={(key) => {
                    const entry = filteredEntries.find(
                      (entry) => entry.pathname === key
                    )
                    if (entry) {
                      router.push(entry.pathname)
                      setOpen(false)
                    }
                  }}
                >
                  {(item) => (
                    <CommandItem key={item.pathname}>{item.title}</CommandItem>
                  )}
                </Menu>
              </Autocomplete>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  )
}

function CommandItem(props: React.ComponentProps<typeof MenuItem>) {
  return (
    <MenuItem
      {...props}
      className={({ isFocused, isSelected }) => `
        group flex w-full items-center rounded-md px-3 py-2 box-border outline-none cursor-default text-gray-900 dark:text-gray-100
        ${isFocused ? 'bg-violet-100 dark:bg-blue-400/20' : ''}
        ${isSelected ? 'bg-violet-200 dark:bg-blue-400/40' : ''}
        hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100
        focus-visible:bg-violet-100 dark:focus-visible:bg-blue-400/20
      `}
    />
  )
}
