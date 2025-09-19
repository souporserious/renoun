import React, { useId } from 'react'
import type { CSSObject } from 'restyle'

import type { MDXHeadings } from '../../mdx/index.js'
import { SectionObserver } from '../SectionObserver/index.js'

type ElementProps<Tag extends keyof React.JSX.IntrinsicElements> =
  React.JSX.IntrinsicElements[Tag] & { css?: CSSObject }

type TableOfContentsComponent<
  Tag extends keyof React.JSX.IntrinsicElements,
  Props = {},
> = React.ComponentType<ElementProps<Tag> & Props>

export interface TableOfContentsComponents {
  Root: TableOfContentsComponent<'nav'>
  Title: TableOfContentsComponent<'h4'>
  List: TableOfContentsComponent<'ol'>
  Item: TableOfContentsComponent<'li'>
  Link: TableOfContentsComponent<'a'>
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
  Root: ({ children, ...props }) => <nav {...props}>{children}</nav>,
  Title: ({ children, ...props }) => (
    <h4 {...props}>{children ?? 'On this page'}</h4>
  ),
  List: ({ children, ...props }) => <ol {...props}>{children}</ol>,
  Item: ({ children, ...props }) => <li {...props}>{children}</li>,
  Link: ({ children, ...props }) => <a {...props}>{children}</a>,
}

export function TableOfContents({
  headings,
  components = {},
  children,
}: TableOfContentsProps) {
  const id = useId()
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
    level = 0
  ): React.ReactNode {
    if (items.length === 0) {
      return null
    }
    return (
      <List style={{ [String('--level')]: level }}>
        {items.map((item) => (
          <Item key={item.id}>
            <SectionObserver.Link id={item.id}>
              <Link>{item.title}</Link>
            </SectionObserver.Link>
            {item.children.length > 0
              ? renderItems(item.children, level + 1)
              : null}
          </Item>
        ))}
      </List>
    )
  }

  if (filteredHeadings.length === 0 && !children) {
    return null
  }

  return (
    <SectionObserver.Provider>
      <Root aria-labelledby={id}>
        <Title id={id} />
        {renderItems(items)}
        {children}
      </Root>
    </SectionObserver.Provider>
  )
}
