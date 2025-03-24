'use client'

export function Contact() {
  return (
    <a
      css={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        padding: '1rem 1.6rem',
        gap: '0.6rem',
        backgroundColor: 'var(--color-surface-primary)',
        color: 'var(--color-foreground)',
        border: 'none',
        borderRadius: '0.6rem',
        fontSize: 'var(--font-size-button-2)',
        fontWeight: 'var(--font-weight-button)',
        cursor: 'pointer',
        textDecoration: 'none',
        transition: 'background-color 0.2s',

        '&:hover': {
          backgroundColor: 'var(--color-surface-primary-highlighted)',
        },
      }}
      onClick={(event) => {
        event.preventDefault()
        window.location.href = `mailto:sales@souporserious.com?subject=${encodeURIComponent('Commercial Licensing Inquiry for renoun')}`
      }}
    >
      <MailIcon />
      Discuss Licensing
    </a>
  )
}

function MailIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}
