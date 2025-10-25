import React, { type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { svgToJsx } from './svg-to-jsx.js'

describe('svgToJsx', () => {
  it('renames common attributes and camel-cases', () => {
    const input = '<svg class="x" stroke-width="2" viewBox="0 0 10 10"></svg>'
    const el = svgToJsx(input) as ReactElement<Record<string, unknown>>
    expect(React.isValidElement(el)).toBe(true)
    expect(el.type).toBe('svg')
    expect((el.props as Record<string, unknown>).className).toBe('x')
    expect((el.props as Record<string, unknown>).strokeWidth).toBe(2)
    expect((el.props as Record<string, unknown>).viewBox).toBe('0 0 10 10')
    expect((el.props as Record<string, unknown>).children).toBeUndefined()
  })

  it('preserves data-/aria- attributes', () => {
    const input = '<svg data-id="1" aria-hidden="true"></svg>'
    const el = svgToJsx(input) as ReactElement<Record<string, unknown>>
    expect((el.props as Record<string, unknown>)['data-id']).toBe('1')
    expect((el.props as Record<string, unknown>)['aria-hidden']).toBe('true')
  })

  it('expands style attribute into object', () => {
    const input = '<svg style="stroke-width: 2; color: red"></svg>'
    const el = svgToJsx(input, { expandStyle: true }) as ReactElement<
      Record<string, unknown>
    >
    expect((el.props as Record<string, unknown>).style).toEqual({
      strokeWidth: 2,
      color: 'red',
    })
  })

  it('supports attribute removal and renaming', () => {
    const input = '<svg foo="bar" data-test="y"></svg>'
    const el = svgToJsx(input, {
      removeAttributes: ['data-test'],
      renameAttributes: { foo: 'baz' },
    }) as ReactElement<Record<string, unknown>>
    expect((el.props as Record<string, unknown>).baz).toBe('bar')
    expect((el.props as Record<string, unknown>)['data-test']).toBeUndefined()
  })

  it('handles nested tags and text', () => {
    const input = '<svg><g><title>hi</title><path d="M0 0"/></g></svg>'
    const el = svgToJsx(input) as ReactElement<Record<string, unknown>>
    const topChildrenArray = React.Children.toArray(
      (el.props as Record<string, unknown>).children as React.ReactNode
    )
    const group = topChildrenArray[0]
    expect(React.isValidElement(group)).toBe(true)
    if (React.isValidElement(group)) {
      const groupChildrenArray = React.Children.toArray(
        (group as React.ReactElement).props.children
      )
      const title = groupChildrenArray[0]
      expect(React.isValidElement(title)).toBe(true)
      if (React.isValidElement(title)) {
        expect(title.type).toBe('title')
        expect((title as React.ReactElement).props.children).toBe('hi')
      }
      const path = groupChildrenArray[1]
      expect(React.isValidElement(path)).toBe(true)
      if (React.isValidElement(path)) {
        expect(path.type).toBe('path')
        expect((path as React.ReactElement).props.d).toBe('M0 0')
      }
    }
  })
})
