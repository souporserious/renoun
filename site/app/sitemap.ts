import { MetadataRoute } from 'next'
import { allData } from 'data'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return allData.all().map((data) => ({
    url: data.url,
    lastModified: data.updatedAt,
  }))
}
