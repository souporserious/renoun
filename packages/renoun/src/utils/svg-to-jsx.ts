import React from 'react'

export interface SvgToJsxOptions {
  /** Remove these attributes anywhere they appear */
  removeAttributes?: string[]

  /** Override or extend attribute renames (after built-ins) */
  renameAttributes?: Record<string, string>

  /** Parse style="a:b;c:d" into a JSX object prop */
  expandStyle?: boolean

  /** Optional props to merge into the root SVG element */
  rootProps?: Record<string, unknown>

  /**
   * When true, scope IDs defined inside the SVG (e.g. clipPath/filter/mask/gradient)
   * with a unique, deterministic prefix and rewrite all url(#...) and id-based
   * references accordingly. This prevents collisions when multiple identical
   * SVGs exist on the page.
   */
  scopeIds?: boolean
}

const BUILTIN_ATTR_RENAMES: Record<string, string> = {
  // HTML-ish
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  // Namespaced
  'xlink:href': 'xlinkHref',
  'xml:space': 'xmlSpace',
  'xmlns:xlink': 'xmlnsXlink',
}

const BOOLISH_ATTRS = new Set<string>([
  'hidden',
  'disabled',
  'readOnly',
  'required',
  'autofocus',
])

/** Camel-case an attribute like stroke-width -> strokeWidth */
function camelCasedAttribute(name: string): string {
  if (
    name.startsWith('data-') ||
    name.startsWith('aria-') ||
    name === 'viewBox'
  ) {
    return name
  }
  if (name.includes(':')) return name
  return name.replace(/-([a-z])/g, (_, character: string) =>
    character.toUpperCase()
  )
}

/** Turn 'a:b; c:d' into { a: "b", c: "d" } object for JSX */
function styleToObject(style: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  style.split(';').forEach((pair) => {
    const trimmed = pair.trim()
    if (!trimmed) return
    const colonIndex = trimmed.indexOf(':')
    if (colonIndex === -1) return
    const key = camelCasedAttribute(trimmed.slice(0, colonIndex).trim())
    const valueRaw = trimmed.slice(colonIndex + 1).trim()
    const numeric = /^[+-]?\d+(\.\d+)?$/.test(valueRaw)
    out[key] = numeric ? Number(valueRaw) : valueRaw
  })
  return out
}

/** Minimal XML tokenizer for tags and text. */
type Token =
  | {
      type: 'tagOpen'
      name: string
      raw: string
      selfClosing: boolean
      attributes: string
    }
  | { type: 'tagClose'; name: string; raw: string }
  | { type: 'text'; value: string }
  | { type: 'comment'; value: string }

function tokenize(xmlInput: string): Token[] {
  const tokens: Token[] = []
  let currentIndex = 0
  let xml = xmlInput
  const xmlLength = xml.length
  // Remove XML declarations / DOCTYPE up front
  xml = xml
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')

  while (currentIndex < xmlLength) {
    const lessThanPosition = xml.indexOf('<', currentIndex)
    if (lessThanPosition === -1) {
      tokens.push({ type: 'text', value: xml.slice(currentIndex) })
      break
    }
    if (lessThanPosition > currentIndex) {
      tokens.push({
        type: 'text',
        value: xml.slice(currentIndex, lessThanPosition),
      })
      currentIndex = lessThanPosition
    }
    if (xml.startsWith('<!--', currentIndex)) {
      const commentEnd = xml.indexOf('-->', currentIndex + 4)
      const endPosition = commentEnd === -1 ? xmlLength : commentEnd + 3
      tokens.push({
        type: 'comment',
        value: xml.slice(
          currentIndex + 4,
          commentEnd === -1 ? xmlLength : commentEnd
        ),
      })
      currentIndex = endPosition
      continue
    }
    if (xml.startsWith('</', currentIndex)) {
      const tagEnd = xml.indexOf('>', currentIndex + 2)
      if (tagEnd === -1) break
      const name = xml.slice(currentIndex + 2, tagEnd).trim()
      tokens.push({
        type: 'tagClose',
        name,
        raw: xml.slice(currentIndex, tagEnd + 1),
      })
      currentIndex = tagEnd + 1
      continue
    }
    const tagEnd = xml.indexOf('>', currentIndex + 1)
    if (tagEnd === -1) break
    const inside = xml.slice(currentIndex + 1, tagEnd)
    const selfClosing = /\/\s*$/.test(inside)
    const parts = inside
      .replace(/\/\s*$/, '')
      .trim()
      .split(/\s+/, 1)
    const name = parts[0] || ''
    const attributes = inside
      .slice(name.length)
      .trim()
      .replace(/\/\s*$/, '')
    tokens.push({
      type: 'tagOpen',
      name,
      raw: xml.slice(currentIndex, tagEnd + 1),
      selfClosing,
      attributes,
    })
    currentIndex = tagEnd + 1
  }
  return tokens
}

/** Parse attribute string into a list preserving quoted values. */
function parseAttributes(
  raw: string
): Array<{ name: string; value: string | null; quoted: boolean }> {
  const out: Array<{ name: string; value: string | null; quoted: boolean }> = []
  let remainingString = raw.trim()
  while (remainingString) {
    const match = remainingString.match(
      /^([^\s=\/>]+)\s*(?:=\s*([^'"`\s][^\s\/>]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))?/
    )
    if (!match) break
    const name = match[1]
    const fullValue = match[2] ?? null
    let value: string | null = null
    let quoted = false
    if (fullValue !== null) {
      if (
        (fullValue.startsWith('"') && fullValue.endsWith('"')) ||
        (fullValue.startsWith("'") && fullValue.endsWith("'"))
      ) {
        value = fullValue.slice(1, -1)
        quoted = true
      } else {
        value = fullValue
      }
    }
    out.push({ name, value, quoted })
    remainingString = remainingString.slice(match[0].length).trim()
  }
  return out
}

/** Convert a single tag's attributes string into a props object. */
function attributesToProps(
  rawAttributes: string,
  options: SvgToJsxOptions
): Record<string, unknown> {
  const attributePairs = parseAttributes(rawAttributes)
  const removeAttributesSet = new Set(
    (options.removeAttributes ?? []).map((attribute) => attribute.toLowerCase())
  )

  const renameMap: Record<string, string> = {
    ...BUILTIN_ATTR_RENAMES,
    ...(options.renameAttributes ?? {}),
  }

  const props: Record<string, unknown> = {}

  for (const { name, value } of attributePairs) {
    const lowerName = name.toLowerCase()
    if (removeAttributesSet.has(lowerName)) continue

    const renamed = renameMap[lowerName] ?? camelCasedAttribute(name)
    if (renamed === 'style' && value && options.expandStyle) {
      props['style'] = styleToObject(value)
      continue
    }

    if (value === null) {
      if (BOOLISH_ATTRS.has(renamed)) {
        props[renamed] = true
      } else {
        props[renamed] = ''
      }
      continue
    }

    const shouldPreserveAsString =
      renamed.startsWith('data-') || renamed.startsWith('aria-')
    const isNumeric = /^[+-]?\d+(\.\d+)?$/.test(value)
    if (isNumeric && !shouldPreserveAsString) {
      props[renamed] = Number(value)
    } else {
      props[renamed] = value
    }
  }

  return props
}

interface ElementNode {
  kind: 'Element'
  name: string
  props: Record<string, unknown>
  children: Array<ElementNode | { kind: 'text'; value: string }>
}

/** Parse SVG markup and return a React element tree. */
export function svgToJsx(
  svg: string,
  options: SvgToJsxOptions = {}
): React.ReactElement {
  const resolvedOptions: SvgToJsxOptions = {
    expandStyle: true,
    scopeIds: true,
    ...options,
  }

  const tokens = tokenize(svg)
  const rootChildren: Array<ElementNode | { kind: 'text'; value: string }> = []
  const stack: ElementNode[] = []

  function appendChild(child: ElementNode | { kind: 'text'; value: string }) {
    if (stack.length > 0) {
      stack[stack.length - 1].children.push(child)
    } else {
      rootChildren.push(child)
    }
  }

  for (const token of tokens) {
    if (token.type === 'comment') continue

    if (token.type === 'text') {
      if (token.value.trim()) {
        appendChild({ kind: 'text', value: token.value })
      }
      continue
    }

    if (token.type === 'tagClose') {
      // Pop when we see a close tag that matches the current element
      const current = stack[stack.length - 1]
      if (current && current.name === token.name) {
        stack.pop()
      }
      continue
    }

    if (token.type === 'tagOpen') {
      const elementName = token.name
      const elementProps = attributesToProps(token.attributes, resolvedOptions)
      const elementNode: ElementNode = {
        kind: 'Element',
        name: elementName,
        props: elementProps,
        children: [],
      }
      if (token.selfClosing) {
        appendChild(elementNode)
      } else {
        appendChild(elementNode)
        stack.push(elementNode)
      }
      continue
    }
  }

  function isTextNode(
    node: ElementNode | { kind: 'text'; value: string }
  ): node is { kind: 'text'; value: string } {
    return node.kind === 'text'
  }

  // ---- Scoped ID rewriting to avoid collisions across multiple SVGs ----
  if (resolvedOptions.scopeIds) {
    // Build a deterministic short hash from the original SVG string
    function hash(input: string): string {
      let h = 2166136261 >>> 0 // FNV-1a 32-bit offset basis
      for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i)
        h = Math.imul(h, 16777619) >>> 0
      }
      return h.toString(36)
    }

    const prefix = `r${hash(svg)}-`

    // Collect all ids defined inside this SVG
    const idMap = new Map<string, string>()

    function walkCollect(node: ElementNode | { kind: 'text'; value: string }) {
      if (isTextNode(node)) return
      const props = node.props
      const idValue = (props as Record<string, unknown>)['id']
      if (typeof idValue === 'string' && idValue) {
        if (!idMap.has(idValue)) idMap.set(idValue, `${prefix}${idValue}`)
      }
      for (const child of node.children) walkCollect(child)
    }

    for (const child of rootChildren) walkCollect(child)

    if (idMap.size > 0) {
      const URL_REF = /url\(#([^\)]+)\)/g

      function rewriteValue(value: unknown, key?: string): unknown {
        if (typeof value === 'string') {
          // url(#id) references (clipPath/mask/filter/gradient/markers)
          if (value.includes('url(#')) {
            return value.replace(URL_REF, (_, id: string) => {
              const mapped = idMap.get(id)
              return mapped ? `url(#${mapped})` : `url(#${id})`
            })
          }
          // href/xlinkHref fragments like #id
          if (
            (key === 'href' || key === 'xlinkHref') &&
            value.startsWith('#')
          ) {
            const id = value.slice(1)
            const mapped = idMap.get(id)
            return `#${mapped ?? id}`
          }
          // aria-labelledby / aria-describedby space-separated id lists
          if (
            (key === 'aria-labelledby' || key === 'aria-describedby') &&
            /\S/.test(value)
          ) {
            return value
              .split(/\s+/)
              .map((token) =>
                idMap.has(token) ? (idMap.get(token) as string) : token
              )
              .join(' ')
          }
          return value
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          // style object potentially containing url(#id)
          const next: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(
            value as Record<string, unknown>
          )) {
            next[k] = rewriteValue(v)
          }
          return next
        }
        return value
      }

      function walkRewrite(
        node: ElementNode | { kind: 'text'; value: string }
      ): void {
        if (isTextNode(node)) return
        const props = node.props as Record<string, unknown>
        if (typeof props['id'] === 'string') {
          const mapped = idMap.get(props['id'] as string)
          if (mapped) props['id'] = mapped
        }
        for (const [k, v] of Object.entries(props)) {
          // 'id' was already handled above
          if (k === 'id') continue
          const rewritten = rewriteValue(v, k)
          if (rewritten !== v) props[k] = rewritten
        }
        for (const child of node.children) walkRewrite(child)
      }

      for (const child of rootChildren) walkRewrite(child)
    }
  }

  function toReact(
    node: ElementNode | { kind: 'text'; value: string }
  ): React.ReactNode {
    if (isTextNode(node)) return node.value
    const elementNode = node
    const childrenNodes = elementNode.children.map((child) => toReact(child))
    return React.createElement(
      elementNode.name,
      elementNode.props,
      ...childrenNodes
    )
  }

  // If multiple roots, wrap in a fragment
  const elements = rootChildren
    .filter((child) => !isTextNode(child) || child.value.trim())
    .map((child) => toReact(child))

  if (elements.length === 0) {
    return React.createElement('svg', resolvedOptions.rootProps ?? {})
  }

  if (elements.length === 1) {
    const onlyElement = elements[0]
    if (resolvedOptions.rootProps && React.isValidElement(onlyElement)) {
      const mergedProps: Record<string, unknown> = {
        ...(onlyElement.props ?? {}),
        ...(resolvedOptions.rootProps ?? {}),
      }
      return React.cloneElement(onlyElement, mergedProps)
    }
    if (React.isValidElement(onlyElement)) return onlyElement
    return React.createElement(React.Fragment, null, onlyElement)
  }

  return React.createElement(React.Fragment, null, ...elements)
}
