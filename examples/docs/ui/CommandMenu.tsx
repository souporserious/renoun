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

interface DocEntry {
  path: string
  title: string
}

interface CommandMenuProps {
  entries: DocEntry[]
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M8.5 3.5a5 5 0 104.03 8.06l3.2 3.2a1 1 0 001.42-1.42l-3.2-3.2A5 5 0 008.5 3.5zm-3 5a3 3 0 116 0 3 3 0 01-6 0z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function CommandMenu({ entries }: CommandMenuProps) {
  let [isOpen, setOpen] = useState(false)
  let { contains } = useFilter({ sensitivity: 'base' })
  let isMac = useMemo(() => /Mac/.test(navigator.platform), [])
  const router = useRouter()

  const [searchQuery, setSearchQuery] = useState('')
  const filteredEntries = entries
    .filter((entry) =>
      entry.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .map((entry) => ({ ...entry, key: entry.path }))

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
      <Button className="group flex items-center rounded-xl bg-black/20 bg-clip-padding border border-white/20 px-3 py-2 font-medium font-[inherit] text-sm sm:text-base text-white/80 hover:bg-white/1 pressed:bg-black/40 transition-colors cursor-default outline-hidden focus-visible:ring-2 focus-visible:ring-white/75 w-full gap-2">
        <SearchIcon className="w-6 h-6 text-white/40 group-hover:text-white transition-colors" />
        <span className="flex-1 text-left">Search</span>
        <span className="hidden sm:flex items-center text-xs text-white/60 group-hover:text-white gap-0.5 transition-colors">
          <kbd className="h-6 aspect-square font-semibold rounded-lg text-xs text-white/60 group-hover:text-white bg-gray-800 outline-none flex items-center justify-center transition-colors">
            {isMac ? '⌘' : 'Ctrl'}
          </kbd>
          <kbd className="h-6 aspect-square font-semibold rounded-lg text-xs text-white/60 group-hover:text-white bg-gray-800 outline-none flex items-center justify-center transition-colors">
            K
          </kbd>
        </span>
      </Button>
      <ModalOverlay
        isDismissable
        className={({ isEntering, isExiting }) => `
          fixed inset-0 z-100 overflow-y-auto bg-black/25 backdrop-blur
          flex min-h-full justify-center p-4 pt-20 text-center
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
          <Dialog className="outline-hidden relative">
            <div className="flex flex-col gap-1 w-[95vw] sm:w-[500px] max-w-full rounded-xl bg-white dark:bg-gray-900 shadow-lg p-2">
              <Autocomplete filter={contains}>
                <TextField
                  aria-label="Search documentation"
                  className="flex flex-col px-3 py-2 rounded-md outline-none placeholder-gray-500 dark:placeholder-gray-400"
                >
                  <Input
                    autoFocus
                    placeholder="Search documentation..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="border border-white/20 py-2 px-3 leading-5 text-gray-900 dark:text-gray-100 bg-black/20 dark:bg-black/20 outline-hidden text-base focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-blue-400 rounded-lg"
                  />
                </TextField>
                <Menu
                  items={filteredEntries}
                  className="mt-2 p-1 max-h-44 overflow-auto"
                  onAction={(key) => {
                    const entry = filteredEntries.find(
                      (entry) => entry.path === key
                    )
                    if (entry) {
                      router.push(entry.path)
                      setOpen(false)
                    }
                  }}
                >
                  {(item) => (
                    <CommandItem key={item.path}>{item.title}</CommandItem>
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
      className="group flex w-full items-center rounded-md px-3 py-2 box-border outline-none cursor-default text-gray-900 dark:text-gray-100 hover:bg-violet-100 dark:hover:bg-gray-800 pressed:bg-violet-200 dark:pressed:bg-gray-700 focus:bg-violet-500 dark:focus:bg-blue-400 focus:text-white dark:focus:text-gray-900 focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-blue-400"
    />
  )
}
