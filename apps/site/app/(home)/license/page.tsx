import { Contact } from './Contact'

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
        flexShrink: 0,
      }}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function PricingHeader() {
  return (
    <div css={{ textAlign: 'center', marginBottom: '4.8rem' }}>
      <h1
        css={{
          fontSize: 'var(--font-size-heading-0)',
          lineHeight: 'var(--line-height-heading-0)',
          fontWeight: 'var(--font-weight-heading)',
          marginBottom: '1.6rem',
        }}
      >
        License Options
      </h1>
      <p
        css={{
          fontSize: 'var(--font-size-heading-2)',
          lineHeight: 'var(--line-height-heading-2)',
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

function FeatureCard({
  title,
  price,
  priceSuffix,
  description,
  features,
  cta,
}: {
  title: string
  price: React.ReactNode
  priceSuffix?: string
  description: string
  features: string[]
  cta: React.ReactNode
}) {
  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '5rem 3.6rem',
        gap: '1.6rem',
        border: '1px solid var(--color-separator)',
        borderRadius: '0.8rem',
        overflow: 'hidden',
      }}
    >
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
        }}
      >
        <h2
          css={{
            fontSize: 'var(--font-size-title)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1rem',
          }}
        >
          {title}
        </h2>

        <div
          css={{
            fontSize: 'var(--font-size-body-1)',
            lineHeight: 'var(--line-height-body-1)',
            color: 'var(--color-foreground-secondary)',
          }}
        >
          <span
            css={{
              fontWeight: 'var(--font-weight-heading)',
              fontSize: 'var(--font-size-heading-2)',
              color: 'var(--color-foreground)',
            }}
          >
            {price}
          </span>
          {priceSuffix}
        </div>
      </div>

      <p
        css={{
          fontSize: 'var(--font-size-body-2)',
          lineHeight: 'var(--line-height-body-2)',
          color: 'var(--color-foreground-secondary)',
        }}
      >
        {description}
      </p>

      <ul
        css={{
          display: 'grid',
          gap: '1rem',
          listStyle: 'none',
          padding: 0,
          margin: '0.8rem 0',
        }}
      >
        {features.map((feature, index) => (
          <li
            key={index}
            css={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              fontSize: 'var(--font-size-body-2)',
              lineHeight: 'var(--line-height-body-2)',
            }}
          >
            <CheckIcon />
            {feature}
          </li>
        ))}
      </ul>

      {cta}
    </div>
  )
}

function FreePlan() {
  return (
    <FeatureCard
      title="Non-Commercial License"
      price="Free Forever"
      description="A generous non-commercial license ideal for blogs, documentation sites, and educational content."
      features={[
        'Blogs and content sites',
        'Project documentation',
        'Educational and community content',
        'Non-profit initiatives',
      ]}
      cta={
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
          Start using renoun
        </a>
      }
    />
  )
}

function CommercialPlan() {
  return (
    <FeatureCard
      title="Commercial License"
      price="Contact Us"
      description="If you plan to integrate renoun into a commercial product or service, drop us an email."
      features={[
        'SaaS products',
        'E-commerce platforms',
        'Enterprise solutions',
        'Priority support',
      ]}
      cta={<Contact />}
    />
  )
}

function PricingFooter() {
  return (
    <div css={{ textAlign: 'center' }}>
      <p
        css={{
          fontSize: 'var(--font-size-body-2)',
          lineHeight: 'var(--line-height-body-2)',
        }}
      >
        More questions about using renoun for your project?{' '}
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

function createArrowDataURI(color: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='${color}'><path d='M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

function FAQItem({
  question,
  children,
}: {
  question: string
  children: React.ReactNode
}) {
  return (
    <details
      css={{
        '--open-close-duration': '0.3s',
        width: '100%',
        backgroundColor: 'var(--color-surface-interactive)',
        borderRadius: '0.8rem',
        overflow: 'hidden',
        '&::-webkit-details-marker': {
          display: 'none',
        },
        '&::details-content': {
          display: 'block',
          height: 0,
          opacity: 0,
          overflow: 'hidden',
          transition: `height var(--open-close-duration) ease, opacity 0.5s ease, content-visibility var(--open-close-duration)`,
          transitionBehavior: 'allow-discrete',
          interpolateSize: 'allow-keywords',
        },
        '&[open]::details-content': {
          height: 'auto',
          opacity: 1,
        },
        '&[open] summary::before': {
          rotate: '0deg',
        },
        '&:has(:focus-visible)': {
          backgroundColor: 'var(--color-surface-interactive-highlighted)',
        },
      }}
    >
      <summary
        css={{
          fontSize: 'var(--font-size-heading-4)',
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          padding: '1.6rem',
          '&:focus': {
            outline: 'none',
          },
          '&::-webkit-details-marker': {
            display: 'none',
          },
          '&::before': {
            content: '""',
            flexShrink: 0,
            width: '1.25rem',
            height: '1.25rem',
            marginRight: '1rem',
            backgroundImage: createArrowDataURI('hsl(200deg 20% 62%)'),
            backgroundRepeat: 'no-repeat',
            backgroundSize: '1.25rem',
            transition: 'rotate 0.2s ease-in-out',
            rotate: '-90deg',
          },
        }}
      >
        {question}
      </summary>
      <p
        css={{
          padding: '0 3.85rem 1.6rem',
          fontSize: 'var(--font-size-body-1)',
          lineHeight: 'var(--line-height-body-1)',
          color: 'var(--color-foreground-secondary)',
        }}
      >
        {children}
      </p>
    </details>
  )
}

function FAQSection() {
  return (
    <section
      css={{
        width: '100%',
        margin: '4rem 0',
        padding: '0 2.4rem',
      }}
    >
      <h2
        css={{
          textAlign: 'center',
          fontSize: 'var(--font-size-heading-2)',
          lineHeight: 'var(--line-height-heading-2)',
          fontWeight: 'var(--font-weight-heading)',
          marginBottom: '2.4rem',
        }}
      >
        Frequently Asked Questions
      </h2>
      <div
        css={{
          display: 'grid',
          gap: '1.6rem',
        }}
      >
        <FAQItem question="Can I use renoun in my documentation site for a paid product?">
          Yes, you can use renoun in your documentation site. However, you
          cannot sell an end SaaS product that uses renoun. For example, selling
          access to an API endpoint that uses renoun.
        </FAQItem>
        <FAQItem question="What projects qualify as non-commercial?">
          Non-commercial projects include blogs, open-source projects,
          educational content, and other initiatives that do not directly
          generate revenue from the use of renoun.
        </FAQItem>
        <FAQItem question="Can I use renoun behind a paywalled product like a course?">
          You may use renoun to serve secondary paywalled content (like a
          private course) as long as you’re not charging for renoun itself or
          building a SaaS platform using renoun.
        </FAQItem>
        <FAQItem question="How do I upgrade to a Commercial License?">
          If you plan to use renoun in a commercial product or service, please
          contact us via email to discuss licensing options and terms.
        </FAQItem>
      </div>
    </section>
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
        <FreePlan />
        <CommercialPlan />
      </div>
      <FAQSection />
      <PricingFooter />
    </div>
  )
}
