import { GitProviderLink } from 'renoun/components'
import { RenounLogo } from 'renoun/assets'

import { NavigationLink } from './NavigationLink'
import { NavigationToggle } from './Sidebar/NavigationToggle'

export function SiteLayout({
  sidebar,
  children,
}: {
  sidebar?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      css={{
        display: 'grid',
        width: '100%',
        flex: 1,
        gridTemplateColumns: '1fr 14rem minmax(0, 60rem) 14rem 1fr',
        gridTemplateRows: 'min-content 1fr',

        '@media screen and (min-width: 60rem)': {
          columnGap: '4rem',
        },
      }}
    >
      {sidebar ? (
        <div
          css={{
            gridRow: '1 / -1',
            gridColumn: '1 / 3',
            backgroundColor: 'var(--color-surface-secondary)',

            '@media screen and (max-width: calc(60rem - 1px))': {
              display: 'none',
            },
          }}
        />
      ) : null}

      <header
        css={{
          gridColumn: '1 / -1',
          gridRow: '1 / 2',
          display: 'flex',
          justifyContent: 'center',
          borderBottom: '1px solid var(--color-separator)',
        }}
      >
        <nav
          css={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'end',
            width: '100%',
            maxWidth: '76rem',
            padding: '2rem',
            gap: '1.5rem',

            '@media screen and (min-width: 60rem)': {
              padding: '1rem 2rem',
            },
          }}
        >
          <a
            href="/"
            css={{
              display: 'flex',
              marginRight: 'auto',
            }}
          >
            <RenounLogo
              style={{
                width: 'unset',
                height: 'var(--font-size-heading-3)',
                fill: 'white',
              }}
            />
          </a>

          <div
            css={{
              '@media screen and (max-width: calc(60rem - 1px))': {
                display: 'none',
              },
              '@media screen and (min-width: 60rem)': {
                display: 'flex',
                gap: '1rem',
              },
            }}
          >
            <NavigationLink
              href="/docs/introduction"
              activePathnames={['/docs']}
            >
              Docs
            </NavigationLink>
            <NavigationLink href="/collections">Collections</NavigationLink>
            <NavigationLink href="/components">Components</NavigationLink>
            <NavigationLink
              href="/sponsors"
              css={{
                paddingInline: '0.5rem',
                borderRadius: '0.25rem',
                boxShadow: '0 0 0 1px #db61a2',
                color: '#f588c2',
                ':hover': {
                  color: 'white',
                },
              }}
            >
              Sponsors
            </NavigationLink>
          </div>

          <div
            css={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              '@media screen and (max-width: calc(60rem - 1px))': {
                gap: '1.5rem',
              },
              '@media screen and (min-width: 60rem)': {
                gap: '1rem',
              },
            }}
          >
            <a
              css={{
                width: 'var(--font-size-body-1)',
                height: 'var(--font-size-body-1)',
                fill: 'var(--color-foreground-interactive)',
              }}
              href="https://discord.gg/7Mf4xEBYx9"
            >
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 24 24"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M20.3468 4.62094C18.7822 3.92321 17.1206 3.41468 15.3862 3.13086C15.1679 3.49747 14.9253 3.99416 14.7555 4.38442C12.9108 4.12424 11.0793 4.12424 9.26006 4.38442C9.09025 3.99416 8.83554 3.49747 8.62935 3.13086C6.88287 3.41468 5.22126 3.92321 3.66761 4.62094C0.526326 9.13849 -0.322673 13.5496 0.101825 17.9016C2.18793 19.3798 4.20128 20.2787 6.17944 20.87C6.66458 20.2313 7.10121 19.5454 7.4772 18.8241C6.76161 18.5639 6.08242 18.2446 5.42748 17.8661C5.59727 17.7479 5.76708 17.6178 5.92475 17.4877C9.87864 19.2498 14.1612 19.2498 18.0666 17.4877C18.2364 17.6178 18.3941 17.7479 18.5639 17.8661C17.9089 18.2446 17.2297 18.5639 16.5141 18.8241C16.8901 19.5454 17.3268 20.2313 17.8119 20.87C19.7888 20.2787 21.8143 19.3798 23.8895 17.9016C24.4109 12.8637 23.0635 8.4881 20.3468 4.62094ZM8.02297 15.2171C6.83436 15.2171 5.86408 14.1646 5.86408 12.8756C5.86408 11.5865 6.81011 10.534 8.02297 10.534C9.22367 10.534 10.2061 11.5865 10.1818 12.8756C10.1818 14.1646 9.22367 15.2171 8.02297 15.2171ZM15.9926 15.2171C14.804 15.2171 13.8325 14.1646 13.8325 12.8756C13.8325 11.5865 14.7797 10.534 15.9926 10.534C17.1934 10.534 18.1757 11.5865 18.1515 12.8756C18.1515 14.1646 17.2055 15.2171 15.9926 15.2171Z" />
              </svg>
            </a>
            <GitProviderLink
              css={{
                width: 'var(--font-size-body-1)',
                height: 'var(--font-size-body-1)',
                fill: 'var(--color-foreground-interactive)',
              }}
            />
            <NavigationToggle
              css={{
                '@media screen and (min-width: 60rem)': {
                  display: 'none',
                },
              }}
            />
          </div>
        </nav>
      </header>

      {sidebar}

      <main
        css={{
          gridColumn: '-1 / 1',
          gridRow: '4',
          padding: '4rem 2rem',

          '@media screen and (min-width: 60rem)': {
            gridColumn: sidebar ? '3 / -2' : '2 / -2',
            gridRow: '2',
            padding: '6rem 0',
          },
        }}
      >
        {children}
      </main>
    </div>
  )
}
