import { Link } from "waku";

import { BlogCard } from "@/components/blog-card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { BlogPostDirectory } from "@/collections";

export default async function HomePage() {
  const posts = await getData();

  return (
    <>
      <title>Waku Renoun Blog</title>
      <div className="flex flex-col">
        {/* Hero Section */}
        <section className="container mx-auto px-4 py-20 md:py-32">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6 text-balance">
              Thoughts on design, development, and everything in between
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-8">
              Exploring the intersection of technology, creativity, and user
              experience. Join me as I share insights, tutorials, and
              reflections on building better digital products.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button asChild size="lg">
                <Link to="/blog">
                  Explore Articles
                  <ArrowRight className="ml-2" size={20} />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/about">About Me</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Latest Posts Section */}
        <section className="container mx-auto px-4 py-16 border-t border-border">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold">Latest Articles</h2>
            <Button asChild variant="ghost">
              <Link to="/blog" className="flex items-center gap-2">
                View all
                <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <BlogCard key={post.slug} {...post} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

const getData = async () => {
  const postEntries = (await BlogPostDirectory.getEntries()).slice(0, 3);

  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  });

  return await Promise.all(
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
