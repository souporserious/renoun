import { allData } from 'data'
import { getSiteMetadata } from '../../utils/get-site-metadata'

export async function GET() {
  const metadata = getSiteMetadata()
  const feed = allData.rss({
    title: metadata.title,
    description: metadata.description,
    copyright: `©${new Date().getFullYear()} @souporserious`,
  })
  return new Response(feed)
}
