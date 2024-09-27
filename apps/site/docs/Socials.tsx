import { styled } from 'restyle'
import { GitProviderLogo } from 'renoun/components'
import { Row } from '@/components/Row'

const SocialLink = styled('a', {
  borderRadius: '0.25rem',
  backgroundColor: 'var(--color-surface-interactive)',
  ':hover': {
    backgroundColor: 'var(--color-surface-interactive-highlighted)',
    textDecoration: 'none !important',
  },
  '& div': {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem 0.75rem',
    backgroundColor: 'var(--color-surface-secondary)',
  },
  '& p': {
    fontSize: '0.8rem',
    lineHeight: 1.35,
    textAlign: 'center',
    padding: '1.5rem 0.75rem',
    letterSpacing: '0.025em',
    textWrap: 'balance',
    color: 'var(--color-foreground-interactive)',
  },
  '& strong': {
    color: 'var(--color-foreground-interactive)',
  },
})

const StyledGitProviderLogo = styled(GitProviderLogo, {
  width: '1.6rem',
  height: '1.6rem',
  fill: 'var(--color-foreground-interactive)',
})

export function Socials() {
  return (
    <Row>
      <SocialLink href="https://discord.gg/7Mf4xEBYx9">
        <div>
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 24 24"
            css={{
              width: '1.6rem',
              height: '1.6rem',
              fill: 'var(--color-foreground-secondary)',
            }}
          >
            <path d="M20.3468 4.62094C18.7822 3.92321 17.1206 3.41468 15.3862 3.13086C15.1679 3.49747 14.9253 3.99416 14.7555 4.38442C12.9108 4.12424 11.0793 4.12424 9.26006 4.38442C9.09025 3.99416 8.83554 3.49747 8.62935 3.13086C6.88287 3.41468 5.22126 3.92321 3.66761 4.62094C0.526326 9.13849 -0.322673 13.5496 0.101825 17.9016C2.18793 19.3798 4.20128 20.2787 6.17944 20.87C6.66458 20.2313 7.10121 19.5454 7.4772 18.8241C6.76161 18.5639 6.08242 18.2446 5.42748 17.8661C5.59727 17.7479 5.76708 17.6178 5.92475 17.4877C9.87864 19.2498 14.1612 19.2498 18.0666 17.4877C18.2364 17.6178 18.3941 17.7479 18.5639 17.8661C17.9089 18.2446 17.2297 18.5639 16.5141 18.8241C16.8901 19.5454 17.3268 20.2313 17.8119 20.87C19.7888 20.2787 21.8143 19.3798 23.8895 17.9016C24.4109 12.8637 23.0635 8.4881 20.3468 4.62094ZM8.02297 15.2171C6.83436 15.2171 5.86408 14.1646 5.86408 12.8756C5.86408 11.5865 6.81011 10.534 8.02297 10.534C9.22367 10.534 10.2061 11.5865 10.1818 12.8756C10.1818 14.1646 9.22367 15.2171 8.02297 15.2171ZM15.9926 15.2171C14.804 15.2171 13.8325 14.1646 13.8325 12.8756C13.8325 11.5865 14.7797 10.534 15.9926 10.534C17.1934 10.534 18.1757 11.5865 18.1515 12.8756C18.1515 14.1646 17.2055 15.2171 15.9926 15.2171Z" />
          </svg>
        </div>
        <p>
          Join our Discord to chat with the community, get help, and stay
          updated.
        </p>
      </SocialLink>
      <SocialLink href="https://github.com/souporserious/renoun">
        <div>
          <StyledGitProviderLogo
            css={{ fill: 'var(--color-foreground-secondary)' }}
          />
        </div>
        <p>
          Contribute, report bugs, or help support Renoun by giving us a star on
          GitHub.
        </p>
      </SocialLink>
      <SocialLink href="https://x.com/renoun_dev">
        <div>
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 16 16"
            css={{
              width: '1.6rem',
              height: '1.6rem',
              fill: 'var(--color-foreground-secondary)',
            }}
          >
            <path
              fillRule="evenodd"
              d="M0.5 0.5H5.75L9.48421 5.71053L14 0.5H16L10.3895 6.97368L16.5 15.5H11.25L7.51579 10.2895L3 15.5H1L6.61053 9.02632L0.5 0.5ZM12.0204 14L3.42043 2H4.97957L13.5796 14H12.0204Z"
            />
          </svg>
        </div>
        <p>
          Follow <strong>renoun_dev</strong> on X for updates and announcements.
        </p>
      </SocialLink>
    </Row>
  )
}
