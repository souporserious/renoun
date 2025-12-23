import React, { useId } from 'react'

import type { Section, ContentSection } from '../../file-system/index.tsx'
import { Script } from '../Script.ts'
import { Register } from './Register.ts'

/** A section for the table of contents (either Section or ContentSection). */
export type TableOfContentsSection = Section | ContentSection

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
  /** The sections to display within the table of contents. */
  sections: TableOfContentsSection[]

  /** Override the default component renderers. */
  components?: Partial<TableOfContentsComponents>

  /** Optional content rendered after the section links. */
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
  return <Script nonce={nonce}>{import('./script.ts')}</Script>
}

/** Check if a section has a depth property (is ContentSection). */
function hasDepth(section: TableOfContentsSection): section is ContentSection {
  return 'depth' in section && typeof section.depth === 'number'
}

/** Collect all section IDs recursively. */
function collectSectionIds(
  sections: TableOfContentsSection[],
  ids: Set<string>
): void {
  for (const section of sections) {
    ids.add(section.id)
    if (section.children) {
      collectSectionIds(section.children, ids)
    }
  }
}

/** A table of contents that displays links to the sections in the current document. */
export function TableOfContents({
  sections,
  components = {},
  children,
}: TableOfContentsProps) {
  const rootId = useId()
  const sectionIds = new Set<string>()
  const { Root, Title, List, Item, Link }: TableOfContentsComponents = {
    ...defaultComponents,
    ...components,
  }

  // Filter to only show sections with depth > 1 (skip h1) for ContentSection,
  // or include all sections for Section (no depth property)
  const filteredSections = sections.filter(
    (section) => !hasDepth(section) || section.depth > 1
  )

  // Collect all section IDs for scroll tracking
  collectSectionIds(filteredSections, sectionIds)

  function renderSections(
    sections: TableOfContentsSection[],
    depth = 0
  ): React.ReactNode {
    if (sections.length === 0) {
      return null
    }
    return (
      <List depth={depth}>
        {sections.map((section) => (
          <Item key={section.id}>
            <Link href={`#${section.id}`} suppressHydrationWarning>
              {'jsx' in section && section.jsx !== undefined
                ? section.jsx
                : section.title}
            </Link>
            {section.children && section.children.length > 0
              ? renderSections(section.children, depth + 1)
              : null}
          </Item>
        ))}
      </List>
    )
  }

  if (filteredSections.length === 0 && !children) {
    return null
  }

  return (
    <Root aria-labelledby={rootId}>
      <Title id={rootId} />
      {renderSections(filteredSections)}
      {children}
      <Register ids={Array.from(sectionIds)} />
    </Root>
  )
}
