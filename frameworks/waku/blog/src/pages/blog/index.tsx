import { BlogPostDirectory } from "@/collections";

import { BlogCard } from "@/components/blog-card";

export default async function BlogIndexPage() {
  const posts = await getData();

  return (
    <>
      <title>Blog</title>
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">All Articles</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            A collection of thoughts, tutorials, and insights on web
            development, design, and technology.
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

const getData = async () => {
  const postEntries = await BlogPostDirectory.getEntries();

  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  });

  return Promise.all(
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
};

export const getConfig = async () => {
  return {
    render: "static",
  } as const;
};
