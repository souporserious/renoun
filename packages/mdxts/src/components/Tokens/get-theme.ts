import { once } from './utils'

export const getTheme = once(async () => {
  const theme = 'night-owl'
  const response = await fetch(
    `https://unpkg.com/tm-themes@1.4.0/themes/${theme}.json`
  )
  const json = await response.json()
  const background =
    json?.colors?.['editor.background'] ||
    json?.colors?.['background'] ||
    '#000000'
  const foreground =
    json?.colors?.['editor.foreground'] ||
    json?.colors?.['foreground'] ||
    '#ffffff'

  return Object.assign(json, { background, foreground })
})
