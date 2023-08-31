const languages = {
  mjs: 'javascript',
}

export function getLanguageFromClassName(className: string = '') {
  const language = className
    .split(' ')
    .find((name) => name.startsWith('language-'))
    ?.slice(9)

  return language ? languages[language] ?? language : null
}
