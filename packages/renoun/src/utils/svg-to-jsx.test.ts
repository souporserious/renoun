import React, { type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { svgToJsx } from './svg-to-jsx.js'

describe('svgToJsx', () => {
  it('renames common attributes and camel-cases', () => {
    const input = '<svg class="x" stroke-width="2" viewBox="0 0 10 10"></svg>'
    const element = svgToJsx(input) as ReactElement<{ [key: string]: unknown }>
    expect(React.isValidElement(element)).toBe(true)
    expect(element.type).toBe('svg')
    const props = element.props as Record<string, unknown>
    expect(props.className).toBe('x')
    expect(props.strokeWidth).toBe(2)
    expect(props.viewBox).toBe('0 0 10 10')
    expect(props.children).toBeUndefined()
  })

  it('preserves data-/aria- attributes', () => {
    const input = '<svg data-id="1" aria-hidden="true"></svg>'
    const element = svgToJsx(input) as ReactElement<{ [key: string]: unknown }>
    const props = element.props as { [key: string]: unknown }
    expect(props['data-id']).toBe('1')
    expect(props['aria-hidden']).toBe('true')
  })

  it('expands style attribute into object', () => {
    const input = '<svg style="stroke-width: 2; color: red"></svg>'
    const element = svgToJsx(input, { expandStyle: true }) as ReactElement<{
      [key: string]: unknown
    }>
    const props = element.props as { [key: string]: unknown }
    expect(props.style).toEqual({ strokeWidth: 2, color: 'red' })
  })

  it('supports attribute removal and renaming', () => {
    const input = '<svg foo="bar" data-test="y"></svg>'
    const element = svgToJsx(input, {
      removeAttributes: ['data-test'],
      renameAttributes: { foo: 'baz' },
    }) as ReactElement<{ [key: string]: unknown }>
    const props = element.props as { [key: string]: unknown }
    expect(props.baz).toBe('bar')
    expect(props['data-test']).toBeUndefined()
  })

  it('handles nested tags and text', () => {
    const input = '<svg><g><title>hi</title><path d="M0 0"/></g></svg>'
    const element = svgToJsx(input) as ReactElement<{
      children?: React.ReactNode
    }>
    const children = React.Children.toArray(element.props.children ?? null)
    const groupNode = children[0]
    expect(React.isValidElement(groupNode)).toBe(true)
    if (React.isValidElement<{ children?: React.ReactNode }>(groupNode)) {
      const groupChildren = React.Children.toArray(
        groupNode.props.children ?? null
      )
      const titleNode = groupChildren[0]
      expect(React.isValidElement(titleNode)).toBe(true)
      if (React.isValidElement<{ children?: React.ReactNode }>(titleNode)) {
        expect(titleNode.type).toBe('title')
        expect(titleNode.props.children).toBe('hi')
      }
      const pathNode = groupChildren[1]
      expect(React.isValidElement(pathNode)).toBe(true)
      if (React.isValidElement<{ d?: string }>(pathNode)) {
        expect(pathNode.type).toBe('path')
        expect(pathNode.props.d).toBe('M0 0')
      }
    }
  })
})
