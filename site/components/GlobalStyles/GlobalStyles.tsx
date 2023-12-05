'use client'
import { createGlobalStyle } from 'styled-components'
import { cssVariables, mediaQuery } from 'theme'

export const GlobalStyles = createGlobalStyle`
  :root {
    ${Object.entries(cssVariables)
      .map(([key, value]) => `${key}: ${value};`)
      .join('\n')}
  }
  * {
    box-sizing: border-box;
  }
  html {
    font-size: 40%;
    ${mediaQuery.medium} {
      font-size: 56%;
    }
    ${mediaQuery.large} {
      font-size: 72%;
    }
    ${mediaQuery.xlarge} {
      font-size: 100%;
    }
  }
  body {
    margin: 0;
    font-family: 'Inter', sans-serif;
    background: #2d0e46;
    color: white;
  }
  #root {
    width: 100%;
    min-height: 100vh;
  }
`
