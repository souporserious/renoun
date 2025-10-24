import { Link } from "waku";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

interface BlogCardProps {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  category: string;
}

export function BlogCard({
  slug,
  title,
  excerpt,
  date,
  category,
}: BlogCardProps) {
  return (
    <Card className="group hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="px-2 py-1 bg-secondary rounded-md">{category}</span>
          <span>•</span>
          <time>{date}</time>
        </div>
        <h3 className="text-xl font-semibold leading-tight group-hover:text-accent transition-colors">
          {title}
        </h3>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground leading-relaxed">{excerpt}</p>
      </CardContent>
      <CardFooter>
        <Link
          to={`/blog/${slug}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-accent transition-colors"
        >
          Read more
          <ArrowRight
            size={16}
            className="group-hover:translate-x-1 transition-transform"
          />
        </Link>
      </CardFooter>
    </Card>
  );
}
