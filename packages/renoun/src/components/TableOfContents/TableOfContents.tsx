import React, { useId } from 'react'

import type { MDXHeadings } from '../../mdx/index.js'
import { Script } from '../Script.js'
import { Register } from './Register.js'

export interface TableOfContentsComponents {
  /** Root navigation element. */
  Root: React.ComponentType<{
    children?: React.ReactNode
    'aria-labelledby'?: string
  }>

  /** Title heading. */
  Title: React.ComponentType<{
    id?: string
    children?: React.ReactNode
  }>

  /** Ordered list of items. */
  List: React.ComponentType<{
    depth: number
    children?: React.ReactNode
  }>

  /** Individual list item. */
  Item: React.ComponentType<{
    children?: React.ReactNode
  }>

  /** Anchor link to a heading. */
  Link: React.ComponentType<{
    children?: React.ReactNode
    href: string
    suppressHydrationWarning?: boolean
    'aria-current'?: React.AriaAttributes['aria-current']
  }>
}

export interface TableOfContentsProps {
  /** The headings to display within the table of contents. */
  headings: MDXHeadings

  /** Override the default component renderers. */
  components?: Partial<TableOfContentsComponents>

  /** Optional content rendered after the heading links. */
  children?: React.ReactNode
}

const defaultComponents: TableOfContentsComponents = {
  Root: (props) => <nav {...props} />,
  Title: ({ children = 'On this page', ...props }) => (
    <h4 {...props}>{children}</h4>
  ),
  List: (props) => <ol {...props} />,
  Item: (props) => <li {...props} />,
  Link: (props) => <a {...props} />,
}

/**
 * Script to manage active heading state in the table of contents.
 * @internal
 */
export function TableOfContentsScript({ nonce }: { nonce?: string }) {
  return <Script nonce={nonce}>{import('./script.js')}</Script>
}

/** A table of contents that displays links to the headings in the current document. */
export function TableOfContents({
  headings,
  components = {},
  children,
}: TableOfContentsProps) {
  const rootId = useId()
  const headingIds = new Set<string>()
  const { Root, Title, List, Item, Link }: TableOfContentsComponents = {
    ...defaultComponents,
    ...components,
  }
  const filteredHeadings = headings.filter((heading) => heading.level > 1)

  interface TableOfContentsItem {
    id: string
    level: number
    title: React.ReactNode
    children: TableOfContentsItem[]
  }

  const items: TableOfContentsItem[] = []
  if (filteredHeadings.length > 0) {
    const baseLevel = filteredHeadings[0].level
    const parents: (TableOfContentsItem | undefined)[] = []

    for (const heading of filteredHeadings) {
      const depth = Math.max(0, heading.level - baseLevel)
      const node: TableOfContentsItem = {
        id: heading.id,
        level: heading.level,
        title: heading.children ?? heading.text,
        children: [],
      }

      if (depth === 0) {
        items.push(node)
      } else {
        // Prefer the exact parent at depth 1, otherwise fall back to the closest existing ancestor.
        const parent =
          parents[depth - 1] ?? parents.slice(0, depth).reverse().find(Boolean)
        if (parent) {
          parent.children.push(node)
        } else {
          items.push(node)
        }
      }

      // Record this node as the current item at its depth and truncate deeper parents.
      parents[depth] = node
      parents.length = depth + 1
    }
  }

  function renderItems(
    items: TableOfContentsItem[],
    depth = 0
  ): React.ReactNode {
    if (items.length === 0) {
      return null
    }
    return (
      <List depth={depth}>
        {items.map((item) => {
          headingIds.add(item.id)
          return (
            <Item key={item.id}>
              <Link href={`#${item.id}`} suppressHydrationWarning>
                {item.title}
              </Link>
              {item.children.length > 0
                ? renderItems(item.children, depth + 1)
                : null}
            </Item>
          )
        })}
      </List>
    )
  }

  if (filteredHeadings.length === 0 && !children) {
    return null
  }

  return (
    <Root aria-labelledby={rootId}>
      <Title id={rootId} />
      {renderItems(items)}
      {children}
      <Register ids={Array.from(headingIds)} />
    </Root>
  )
}
