import type { TableOfContentsSection } from 'renoun'

import { TableOfContents } from '@/components/TableOfContents'
import Sponsors, { sections } from './sponsors.mdx'
import { tiers, SponsorTiers } from './SponsorTiers'

const sponsorSections: TableOfContentsSection[] = tiers.map((tier) => ({
  id: tier.title.toLowerCase(),
  title: tier.title,
}))

export default function Page() {
  const allSections: TableOfContentsSection[] = [...sections, ...sponsorSections]

  return (
    <>
      <main>
        <div className="prose" css={{ marginBottom: '3rem' }}>
          <Sponsors />
        </div>
        <SponsorTiers />
      </main>
      <TableOfContents sections={allSections} />
    </>
  )
}
