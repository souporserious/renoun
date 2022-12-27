import styled, { css, keyframes } from 'styled-components'

const rotate = keyframes({
  '100%': { transform: 'rotate(360deg)' },
})

const rotateCentered = keyframes({
  '100%': { transform: 'translate(-50%, -50%) rotate(360deg)' },
})

export const spinnerSizes = {
  sm: '12px',
  md: '32px',
  lg: '64px',
} as const

export const spinnerSizeThickness = {
  sm: '2px',
  md: '4px',
  lg: '8px',
} as const

export type SpinnerProps = {
  /**
   * Primary color of spinner.
   */
  primaryColor?: string

  /**
   * Secondary color of spinner.
   */
  secondaryColor?: string

  /**
   * Size of spinner.
   */
  size?: 'sm' | 'md' | 'lg'

  /**
   * Position absolutely in the center of a relative parent.
   */
  center?: boolean
}

export const Spinner = styled.div<SpinnerProps>(
  ({ primaryColor, secondaryColor, size = 'md' }) => ({
    width: spinnerSizes[size],
    height: spinnerSizes[size],
    border: `${spinnerSizeThickness[size]} solid ${secondaryColor}`,
    borderTopColor: primaryColor,
    borderRadius: '100%',
  }),
  ({ center }) =>
    center
      ? css`
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(0deg);
          animation: ${rotateCentered} 500ms infinite linear;
        `
      : css`
          transform: rotate(0deg);
          animation: ${rotate} 500ms infinite linear;
        `
)
