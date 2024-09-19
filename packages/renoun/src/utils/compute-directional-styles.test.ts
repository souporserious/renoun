import { describe, it, expect } from 'vitest'

import { computeDirectionalStyles } from './compute-directional-styles'

describe('computeDirectionalStyles', () => {
  it('returns all sides with default values when css and style are empty', () => {
    const result = computeDirectionalStyles('padding', 10, {}, {})
    expect(result).toEqual({
      top: '10px',
      right: '10px',
      bottom: '10px',
      left: '10px',
      all: '10px',
      horizontal: '10px',
      vertical: '10px',
    })
  })

  it('computes values from css when css values are provided', () => {
    const css = { padding: '5px 10px 15px 20px' }
    const result = computeDirectionalStyles('padding', 0, css, {})
    expect(result).toEqual({
      top: '5px',
      right: '10px',
      bottom: '15px',
      left: '20px',
      all: '5px 10px 15px 20px',
      horizontal: '20px 10px',
      vertical: '5px 15px',
    })
  })

  it('computes values from style when style values are provided', () => {
    const style = { padding: '5px 10px 15px 20px' }
    const result = computeDirectionalStyles('padding', 0, {}, style)
    expect(result).toEqual({
      top: '5px',
      right: '10px',
      bottom: '15px',
      left: '20px',
      all: '5px 10px 15px 20px',
      horizontal: '20px 10px',
      vertical: '5px 15px',
    })
  })

  it('prioritizes style values over css values', () => {
    const css = { padding: '5px 10px 15px 20px' }
    const style = { paddingTop: '50px', paddingRight: '100px' }
    const result = computeDirectionalStyles('padding', 0, css, style)
    expect(result).toEqual({
      top: '50px',
      right: '100px',
      bottom: '15px',
      left: '20px',
      all: '50px 100px 15px 20px',
      horizontal: '20px 100px',
      vertical: '50px 15px',
    })
  })

  it('handles single values for padding', () => {
    const css = { padding: '5px' }
    const result = computeDirectionalStyles('padding', 0, css, {})
    expect(result).toEqual({
      top: '5px',
      right: '5px',
      bottom: '5px',
      left: '5px',
      all: '5px',
      horizontal: '5px',
      vertical: '5px',
    })
  })

  it('handles two values for padding (vertical and horizontal)', () => {
    const css = { padding: '5px 10px' }
    const result = computeDirectionalStyles('padding', 0, css, {})
    expect(result).toEqual({
      top: '5px',
      right: '10px',
      bottom: '5px',
      left: '10px',
      all: '5px 10px 5px 10px',
      horizontal: '10px',
      vertical: '5px',
    })
  })

  it('handles three values for padding (top, horizontal, bottom)', () => {
    const css = { padding: '5px 10px 15px' }
    const result = computeDirectionalStyles('padding', 0, css, {})
    expect(result).toEqual({
      top: '5px',
      right: '10px',
      bottom: '15px',
      left: '10px',
      all: '5px 10px 15px 10px',
      horizontal: '10px',
      vertical: '5px 15px',
    })
  })

  it('handles four values for padding (top, right, bottom, left)', () => {
    const css = { padding: '5px 10px 15px 20px' }
    const result = computeDirectionalStyles('padding', 0, css, {})
    expect(result).toEqual({
      top: '5px',
      right: '10px',
      bottom: '15px',
      left: '20px',
      all: '5px 10px 15px 20px',
      horizontal: '20px 10px',
      vertical: '5px 15px',
    })
  })

  it('parses default numeric value correctly', () => {
    const result = computeDirectionalStyles('padding', 12, {}, {})
    expect(result).toEqual({
      top: '12px',
      right: '12px',
      bottom: '12px',
      left: '12px',
      all: '12px',
      horizontal: '12px',
      vertical: '12px',
    })
  })
})
