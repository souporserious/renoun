import { createGlobalStyle } from 'styled-components'
import { cssVariables, mediaQuery } from 'theme'

export const GlobalStyles = createGlobalStyle({
  ':root': cssVariables ,
  '*': {
    boxSizing: 'border-box',
  },
  html: {
    fontSize: '40%',
    [String(mediaQuery.medium)]: {
      fontSize: '56%',
    },
    [String(mediaQuery.large)]: {
      fontSize: '72%',
    },
    [String(mediaQuery.xlarge)]: {
      fontSize: '100%',
    },
  },
  body: {
    margin: 0,
    fontFamily: "'Inter', sans-serif",
    background: '#2d0e46',
    color: 'white',
  },
  '#root': {
    width: '100%',
    minHeight: '100vh',
  },
})
