export const size = {
  medium: '784px',
  large: '960px',
  xlarge: '1280px',
} as const

export const mediaQuery = {
  medium: `@media (min-width: ${size.medium})`,
  large: `@media (min-width: ${size.large})`,
  xlarge: `@media (min-width: ${size.xlarge})`,
} as const

export const cssVariables = {
  [String('--heading1')]: '5rem',
  [String('--heading2')]: '4rem',
  [String('--heading3')]: '3rem',
  [String('--body1')]: '2rem',
  [String('--body2')]: '1rem',
  [String('--header-icon-size')]: '3rem',
  [String(mediaQuery.medium)]: {
    '--header-icon-size': '2rem',
  },
} as const

export const colors = {} as const

export const textStyles = {
  heading1: {
    fontSize: `var(--heading1)`,
    fontWeight: 700,
    lineHeight: '1',
  },
  heading2: {
    fontSize: `var(--heading2)`,
    fontWeight: 500,
    lineHeight: '1.25',
  },
  heading3: {
    fontSize: `var(--heading3)`,
    fontWeight: 500,
    lineHeight: '1.25',
  },
  body1: {
    fontSize: `var(--body1)`,
    fontWeight: 400,
    lineHeight: '1.5',
  },
  body2: {
    fontSize: `var(--body2)`,
    fontWeight: 400,
    lineHeight: '1.25',
  },
  mark: {
    background: 'linear-gradient(180deg, #E3BEFF, #A734FF)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
}
