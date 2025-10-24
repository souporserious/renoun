import type { PageProps } from "waku/router";
import { BlogPostDirectory } from "@/collections";

import { BlogCard } from "@/components/blog-card";
import { Link } from "waku";

export default async function TagsPage({ slug }: PageProps<"tags/[slug]">) {
  const posts = await getData(slug);

  return (
    <>
      <title>Articles with Tag: {slug}</title>
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Articles with Tag: {slug}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Articles that mention "{slug.toLowerCase()}".{" "}
            <Link
              to={"/blog"}
              className="font-bold hover:text-secondary-foreground"
            >
              Browse all articles
            </Link>{" "}
            to see everything the collection has to offer.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <BlogCard key={post.slug} {...post} />
          ))}
        </div>
      </div>
    </>
  );
}

const getData = async (slug: string) => {
  const postEntries = await BlogPostDirectory.getEntries();

  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  });

  const posts = await Promise.all(
    postEntries.map(async (entry) => {
      const frontmatter = await entry.getExportValue("frontmatter");
      return {
        slug: entry.getPathnameSegments().slice(1).join("/"),
        title: frontmatter.title,
        excerpt: frontmatter.summary || "",
        date: formatter.format(frontmatter.date),
        category: frontmatter.category,
        raw: frontmatter,
      };
    })
  );

  return posts.filter((post) => post.raw.tags?.includes(slug));
};

const getTags = async () => {
  const postEntries = await BlogPostDirectory.getEntries();
  const tags = (await (Promise.all(
    postEntries.map(async (entry) => {
      const frontmatter = await entry.getExportValue("frontmatter");
      return frontmatter.tags;
    })
  ))).filter(Boolean).flat();

  return [...new Set(tags)];
};

export const getConfig = async () => {
  const staticPaths = await getTags();

  return {
    render: "static",
    staticPaths,
  } as const;
};
