import { TableOfContents } from '@/components/TableOfContents'
import Sponsors, { headings } from './sponsors.mdx'
import { tiers, SponsorTiers } from './SponsorTiers'

const sponsorHeadings = tiers.map((tier) => ({
  id: tier.title.toLowerCase(),
  text: tier.title,
  level: 3,
}))

export default function Page() {
  return (
    <>
      <main>
        <div className="prose" css={{ marginBottom: '3rem' }}>
          <Sponsors />
        </div>
        <SponsorTiers />
      </main>
      <TableOfContents headings={headings.concat(sponsorHeadings)} />
    </>
  )
}
