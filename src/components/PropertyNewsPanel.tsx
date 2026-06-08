import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Newspaper, ChevronDown, ChevronUp, ExternalLink, RefreshCw } from "lucide-react";
import type { NewsArticle } from "@/lib/news.functions";

function fmtPubDate(raw: string | null): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  if (diffH < 48) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function NewsItem({ article }: { article: NewsArticle }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="group flex flex-col gap-2 border-b py-4 last:border-b-0">
      <div className="flex gap-3">
        {article.imageUrl && (
          <a href={article.link} target="_blank" rel="noreferrer" className="shrink-0">
            <img
              src={article.imageUrl}
              alt=""
              className="h-20 w-28 rounded-md object-cover transition hover:opacity-90"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </a>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{article.source}</Badge>
            {article.pubDate && (
              <span className="text-[11px] text-muted-foreground">{fmtPubDate(article.pubDate)}</span>
            )}
          </div>
          <a
            href={article.link}
            target="_blank"
            rel="noreferrer"
            className="block font-medium leading-snug hover:text-primary hover:underline"
          >
            {article.title}
          </a>
          {article.description && (
            <p className={`mt-1 text-sm text-muted-foreground ${expanded ? "" : "line-clamp-2"}`}>
              {article.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3">
            {article.description && article.description.length > 120 && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {expanded ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Read more</>}
              </button>
            )}
            <a
              href={article.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> Full article
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props {
  articles: NewsArticle[];
  isLoading: boolean;
  onRefresh?: () => void;
}

export function PropertyNewsPanel({ articles, isLoading, onRefresh }: Props) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? articles : articles.slice(0, 6);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper className="h-4 w-4 text-primary" /> UK property news
        </CardTitle>
        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isLoading} title="Refresh news">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-3 border-b py-4 last:border-b-0">
                <div className="h-20 w-28 animate-pulse rounded-md bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )}
        {!isLoading && articles.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            Could not load news feeds right now — check your connection or try refreshing.
          </p>
        )}
        {!isLoading && articles.length > 0 && (
          <>
            {visible.map((article, i) => (
              <NewsItem key={`${article.link}-${i}`} article={article} />
            ))}
            {articles.length > 6 && (
              <div className="mt-2 text-center">
                <Button variant="outline" size="sm" onClick={() => setShowAll((s) => !s)}>
                  {showAll ? "Show fewer articles" : `Show ${articles.length - 6} more articles`}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
