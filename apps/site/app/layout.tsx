import { GlobalStyles } from 'restyle'
import { Analytics } from '@vercel/analytics/react'
import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'

export const metadata = {
  title: 'Renoun',
  description: 'The toolkit to build docs as great as your product.',
} satisfies Metadata

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <link
        href="/favicon-light.svg"
        rel="icon"
        media="(prefers-color-scheme: light)"
      />
      <link
        href="/favicon-dark.svg"
        rel="icon"
        media="(prefers-color-scheme: dark)"
      />
      <body className={GeistSans.className}>
        <GlobalStyles>{styles}</GlobalStyles>
        {children}
        <Analytics />
      </body>
    </html>
  )
}

const styles = {
  ':root': {
    '--color-foreground': '#fff',
    '--color-foreground-secondary': '#cdedff',
    '--color-foreground-interactive': 'hsl(200deg 20% 62%)',
    '--color-background': 'hsl(215deg 46.96% 6.59%)',
    '--color-surface-1': 'hsl(210deg 50% 7%)',
    '--color-surface-2': 'hsl(218deg 42% 10%)',
    '--color-surface-interactive': 'hsl(218deg 42% 12%)',
    '--color-separator': 'hsl(206deg, 56%, 16%)',
    '--color-separator-secondary': 'hsl(210deg 48% 24%)',
    '--color-separator-interactive': 'hsl(200deg 20% 62%)',
    '--font-size-heading-1': '4rem',
    '--font-size-heading-2-marketing': '3.4rem',
    '--font-size-heading-2': '3rem',
    '--font-size-heading-3': '2rem',
    '--font-size-body-1': '2rem',
    '--font-size-body-2': '1.6rem',
    '--font-size-body-3': '1.2rem',
    '--font-size-title': '0.875rem',
    '--font-size-code': '1rem',
    '--line-height-heading-1': '4rem',
    '--line-height-heading-2': '3.4rem',
    '--line-height-heading-3': '2.4rem',
    '--line-height-body-1': '2.625rem',
    '--line-height-body-2': '2.2rem',
    '--line-height-code': '1.2rem',
    '--font-weight-heading': 700,
    '--font-weight-body': 400,
    '--letter-spacing-body': '0.01em',
  },
  '@media screen and (min-width: 60rem)': {
    ':root': {
      '--font-size-heading-1': '3.4rem',
      '--font-size-heading-2': '1.8rem',
      '--font-size-heading-2-marketing': '3rem',
      '--font-size-heading-3': '1.5rem',
      '--font-size-body-1': '1.2rem',
      '--font-size-body-2': '1rem',
      '--font-size-body-3': '0.875rem',
      '--font-size-title': '0.65rem',
      '--font-size-code': '1rem',
      '--line-height-heading-1': '3rem',
      '--line-height-heading-2': '2.4rem',
      '--line-height-heading-3': '1.8rem',
      '--line-height-body-1': '1.65rem',
      '--line-height-body-2': '1.4rem',
      '--line-height-code': '1.4rem',
    },
  },
  '*': {
    boxSizing: 'border-box',
    margin: 0,
    minWidth: 0,
  },
  html: {
    colorScheme: 'dark',
    fontSize: '2.5vw',
    '@media (min-width: 60rem)': {
      fontSize: 'min(18px, 1.2vw)',
    },
  },
  body: {
    WebkitFontSmoothing: 'antialiased',
    textRendering: 'optimizeLegibility',
    fontSize: 'var(--font-size-body-1)',
    letterSpacing: 'var(--letter-spacing-body)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100dvh',
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-foreground)',
  },
  a: {
    color: 'var(--color-foreground-interactive)',
    textDecoration: 'none',
    '&:hover:not(.title)': {
      textDecoration: 'underline',
    },
  },
  button: {
    color: 'var(--color-foreground-interactive)',
  },
  '.prose': {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.6rem',
    '& h1, h2, h3': {
      letterSpacing: 'normal',
      textWrap: 'balance',
      '&::before, &::after': {
        content: "''",
        display: 'table',
      },
    },
    h1: {
      fontSize: 'var(--font-size-heading-1)',
      lineHeight: 'var(--line-height-heading-1)',
      fontWeight: 'var(--font-weight-heading)',
      '&::before': {
        marginBottom: '-0.08em',
      },
      '&::after': {
        marginTop: '-0.0825em',
      },
    },
    h2: {
      fontSize: 'var(--font-size-heading-2)',
      lineHeight: 'var(--line-height-heading-2)',
      fontWeight: 'var(--font-weight-heading)',
      marginBlockStart: '1.6rem',
      '&::before, &::after': {
        marginTop: '-0.3em',
      },
    },
    'h2 + h3': {
      marginBlockStart: 0,
    },
    h3: {
      fontSize: 'var(--font-size-heading-3)',
      lineHeight: 'var(--line-height-heading-3)',
      fontWeight: 'var(--font-weight-heading)',
      '&::before': {
        marginBottom: '-0.25em',
      },
      '&::after': {
        marginTop: '-0.29em',
      },
    },
    p: {
      fontSize: 'var(--font-size-body-1)',
      fontWeight: 'var(--font-weight-body)',
      lineHeight: 'var(--line-height-body-1)',
      textWrap: 'pretty',
    },
    '> p:first-of-type': {
      fontSize: 'var(--font-size-heading-3)',
      lineHeight: 'var(--line-height-heading-3)',
      textWrap: 'pretty',
    },
    li: {
      textWrap: 'pretty',
      '& h1, h2, h3, pre': {
        margin: '1.4rem 0',
      },
    },
  },
  main: {
    padding: '2rem',
    '@media screen and (min-width: 60rem)': {
      padding: '2rem',
    },
  },
  link: {
    color: 'var(--color-foreground-interactive)',
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  title: {
    fontSize: 'var(--font-size-title)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.1rem',
    color: 'var(--color-foreground)',
  },
} as const
