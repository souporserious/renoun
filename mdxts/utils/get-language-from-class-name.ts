const languages = {
  mjs: 'javascript',
}

export function getLanguageFromClassName(className: string = '') {
  const fileNameOrlanguage = className
    .split(' ')
    .find((name) => name.startsWith('language-'))
    ?.slice(9)
  const language = fileNameOrlanguage?.split('.').pop()

  return language ? languages[language] ?? language : null
}
