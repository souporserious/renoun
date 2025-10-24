import type { PageProps } from "waku/router";
import { BlogPostDirectory } from "@/collections";
import { Link } from "waku";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSlug } from "renoun";
import { ComponentProps } from "react";

export default async function BlogPostPage({ slug }: PageProps<"blog/[slug]">) {
  
  const { frontmatter, formatter, tags, Content } = await getData(slug);

  return (
    <>
      <title>{frontmatter.title}</title>
      <div className="container mx-auto px-4 py-16">
        <Button asChild variant="ghost" className="mb-8">
          <Link to="/blog" className="flex items-center gap-2">
            <ArrowLeft size={16} />
            Back to articles
          </Link>
        </Button>

        <article className="max-w-3xl mx-auto">
          <header className="mb-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <span className="px-2 py-1 bg-secondary rounded-md">
                {frontmatter.category}
              </span>
              <span>•</span>
              <time dateTime={frontmatter.date.toISOString().slice(0, 10)}>
                {formatter.format(frontmatter.date)}
              </time>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 text-balance">
              {frontmatter.title}
            </h1>
            {frontmatter.summary ? (
              <p className="text-xl italic">{frontmatter.summary}</p>
            ) : null}
          </header>

          <div className="prose prose-neutral dark:prose-invert max-w-none">
            <Content />
          </div>

          {tags.length ? (
            <div className="border-t mt-4 pt-4">
              <ul className="flex gap-2">
                {tags.map(({ label, slug }) => (
                  <li key={label} className="post__tag">
                    <Link to={`/tags/${slug}` as ComponentProps<typeof Link>["to"]}>
                      <span className="px-2 py-1 bg-secondary hover:bg-primary hover:text-primary-foreground rounded-md">
                        {label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      </div>
    </>
  );
}

const getData = async (slug: string) => {

  const entry = await BlogPostDirectory.getFile(slug, "mdx");

  const frontmatter = await entry.getExportValue("frontmatter");

  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  });
  const tags = (frontmatter.tags ?? []).map((tag) => ({
    label: tag,
    slug: createSlug(tag),
  }));
  const Content = await entry.getExportValue("default");

  return { frontmatter, formatter, tags, Content };
}

export const getConfig = async () => {
  const posts = await BlogPostDirectory.getEntries();
  const staticPaths = posts.map((post) =>
    post.getPathnameSegments({ includeBasePathname: false })
  );

  return {
    render: "static",
    staticPaths,
  } as const;
};
