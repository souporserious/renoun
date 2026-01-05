const mimeTypesByExtension: Record<string, string> = {
  aac: 'audio/aac',
  avif: 'image/avif',
  bmp: 'image/bmp',
  css: 'text/css',
  csv: 'text/csv',
  gif: 'image/gif',
  htm: 'text/html',
  html: 'text/html',
  ico: 'image/vnd.microsoft.icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript',
  json: 'application/json',
  mjs: 'text/javascript',
  md: 'text/markdown',
  mdx: 'text/markdown',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  ogv: 'video/ogg',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  ts: 'text/typescript',
  tsx: 'text/tsx',
  txt: 'text/plain',
  wasm: 'application/wasm',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  xml: 'application/xml',
}

export function inferMediaType(extension?: string) {
  const normalizedExtension = extension?.replace(/^\./, '').toLowerCase()
  return (
    (normalizedExtension && mimeTypesByExtension[normalizedExtension]) ||
    'application/octet-stream'
  )
}
