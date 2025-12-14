import {
  TableOfContents as BaseTableOfContents,
  type TableOfContentsProps,
  type TableOfContentsComponents,
} from 'renoun'

type DocsTableOfContentsProps = Omit<
  TableOfContentsProps,
  'children' | 'components'
>

export function TableOfContents({ headings }: DocsTableOfContentsProps) {
  const components: Partial<TableOfContentsComponents> = {
    Root: (props) => (
      <nav
        {...props}
        className={
          'sticky top-8 pointer-events-auto flex flex-col gap-3 max-h-[calc(100vh-3.5rem-2rem)] overflow-y-auto pr-6 flex-shrink-0'
        }
      />
    ),
    Title: ({ id }) => (
      <h4
        id={id}
        className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
      >
        On this page
      </h4>
    ),
    List: ({ children, depth }) => (
      <ol
        style={{ ['--depth' as any]: depth }}
        className="flex flex-col list-none p-0 m-0"
      >
        {children}
      </ol>
    ),
    Link: (props) => (
      <a
        {...props}
        className="block text-sm py-1 pl-[calc(var(--depth)*0.8rem)] text-blue-600 hover:text-blue-500 dark:text-blue-300 dark:hover:text-blue-200 truncate"
      />
    ),
  }

  return <BaseTableOfContents headings={headings} components={components} />
}
