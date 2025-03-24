function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      css={{
        color: 'var(--color-surface-accent)',
        marginRight: '1.6rem',
        flexShrink: 0,
      }}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
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
      css={{ marginRight: '1rem' }}
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

function PricingHeader() {
  return (
    <div css={{ textAlign: 'center', marginBottom: '4.8rem' }}>
      <h1
        css={{
          fontSize: 'var(--font-size-heading-1)',
          lineHeight: 'var(--line-height-heading-1)',
          fontWeight: 'var(--font-weight-heading)',
          marginBottom: '1.6rem',
        }}
      >
        License Options
      </h1>
      <p
        css={{
          fontSize: 'var(--font-size-body-1)',
          lineHeight: 'var(--line-height-body-1)',
          maxWidth: '60rem',
          margin: '0 auto',
          color: 'var(--color-foreground-secondary)',
        }}
      >
        The renoun toolkit is free for non-commercial projects.
        <br />
        For commercial projects, please contact us for terms.
      </p>
    </div>
  )
}

function FeatureList({ features }: { features: string[] }) {
  return (
    <ul
      css={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        marginBottom: '2.4rem',
      }}
    >
      {features.map((feature, idx) => (
        <li
          key={idx}
          css={{
            display: 'flex',
            alignItems: 'flex-start',
            marginBottom: '1.2rem',
            fontSize: 'var(--font-size-body-2)',
            lineHeight: 'var(--line-height-body-2)',
          }}
        >
          <CheckIcon />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  )
}

function FreePlanCard() {
  const features = [
    'Blogs and content sites',
    'Open-source project documentation',
    'Educational and community content',
    'Non-profit initiatives',
  ]

  return (
    <div
      css={{
        border: '1px solid var(--color-separator)',
        borderRadius: '0.8rem',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
      }}
    >
      <div css={{ padding: '2.4rem' }}>
        <h2
          css={{
            fontSize: 'var(--font-size-heading-3)',
            lineHeight: 'var(--line-height-heading-3)',
            fontWeight: 'var(--font-weight-heading)',
            marginBottom: '0.8rem',
          }}
        >
          Non-Commercial License
        </h2>
        <div
          css={{
            fontSize: 'var(--font-size-body-1)',
            lineHeight: 'var(--line-height-body-1)',
            marginTop: '0.8rem',
          }}
        >
          <span
            css={{
              fontWeight: 'var(--font-weight-heading)',
              fontSize: 'var(--font-size-heading-2)',
            }}
          >
            $0
          </span>{' '}
          / forever
        </div>
      </div>
      <div css={{ padding: '0 2.4rem 2.4rem', flexGrow: 1 }}>
        <p
          css={{
            marginBottom: '2.4rem',
            fontSize: 'var(--font-size-body-2)',
            lineHeight: 'var(--line-height-body-2)',
            color: 'var(--color-foreground-secondary)',
          }}
        >
          Ideal for personal, educational, or open-source projects that do not
          generate revenue.
        </p>
        <FeatureList features={features} />
      </div>
      <div css={{ padding: '0 2.4rem 2.4rem' }}>
        <a
          href="/docs/getting-started"
          css={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            padding: '1rem 1.6rem',
            backgroundColor: 'transparent',
            color: 'var(--color-foreground)',
            border: '1px solid var(--color-surface-accent)',
            borderRadius: '0.6rem',
            fontSize: 'var(--font-size-button-2)',
            fontWeight: 'var(--font-weight-button)',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            textDecoration: 'none',

            '&:hover': {
              backgroundColor: 'var(--color-surface-interactive-highlighted)',
            },
          }}
        >
          Start Using renoun
        </a>
      </div>
    </div>
  )
}

function CommercialPlanCard() {
  const features = [
    'SaaS products',
    'E-commerce platforms',
    'Enterprise solutions',
    'Priority support',
  ]

  return (
    <div
      css={{
        border: '2px solid var(--color-surface-primary)',
        borderRadius: '0.8rem',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxShadow: '0 4px 12px rgba(0,112,243,0.1)',
      }}
    >
      <div css={{ padding: '2.4rem' }}>
        <h2
          css={{
            fontSize: 'var(--font-size-heading-3)',
            lineHeight: 'var(--line-height-heading-3)',
            fontWeight: 'var(--font-weight-heading)',
            marginBottom: '0.8rem',
          }}
        >
          Commercial License
        </h2>
        <div
          css={{
            fontSize: 'var(--font-size-body-1)',
            lineHeight: 'var(--line-height-body-1)',
            marginTop: '0.8rem',
          }}
        >
          <span
            css={{
              fontWeight: 'var(--font-weight-heading)',
              fontSize: 'var(--font-size-heading-2)',
            }}
          >
            Contact Us
          </span>
        </div>
      </div>
      <div css={{ padding: '0 2.4rem 2.4rem', flexGrow: 1 }}>
        <p
          css={{
            marginBottom: '2.4rem',
            fontSize: 'var(--font-size-body-2)',
            lineHeight: 'var(--line-height-body-2)',
            color: 'var(--color-foreground-secondary)',
          }}
        >
          If you plan to integrate renoun into a commercial product or service,
          drop us an email.
        </p>
        <FeatureList features={features} />
      </div>
      <div css={{ padding: '0 2.4rem 2.4rem' }}>
        <a
          href="mailto:sales@example.com"
          css={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            padding: '1rem 1.6rem',
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
        >
          <MailIcon />
          Discuss Licensing
        </a>
      </div>
    </div>
  )
}

function PricingFooter() {
  return (
    <div css={{ textAlign: 'center', marginTop: '6.4rem' }}>
      <p
        css={{
          fontSize: 'var(--font-size-body-2)',
          lineHeight: 'var(--line-height-body-2)',
        }}
      >
        Questions about using renoun for your project?{' '}
        <a
          href="mailto:info@example.com"
          css={{
            color: 'var(--color-surface-accent)',
            textDecoration: 'none',
            '&:hover': {
              textDecoration: 'underline',
            },
          }}
        >
          Contact us
        </a>
      </p>
    </div>
  )
}

export default function PricingPage() {
  return (
    <div
      css={{
        gridColumn: '1 / -1',
        display: 'flex',
        flexDirection: 'column',
        gap: '4rem',

        '@media (min-width: 60rem)': {
          padding: '4rem 8rem',
        },
      }}
    >
      <PricingHeader />
      <div
        css={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(30rem, 1fr))',
          gap: '3.2rem',
          maxWidth: '100rem',
          margin: '0 auto',
        }}
      >
        <FreePlanCard />
        <CommercialPlanCard />
      </div>
      <PricingFooter />
    </div>
  )
}
