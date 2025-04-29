'use client'
import type { CSSObject } from 'restyle'

export function EmailLink({
  css,
  subject,
  ...props
}: {
  css?: CSSObject
  subject?: string
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      css={{
        cursor: 'pointer',
        ...css,
      }}
      onClick={(event) => {
        event.preventDefault()
        window.location.href = subject
          ? `mailto:sales@souporserious.com?subject=${encodeURIComponent(subject)}`
          : `mailto:sales@souporserious.com`
      }}
      {...props}
    />
  )
}
