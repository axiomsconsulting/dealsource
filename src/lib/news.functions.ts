import { createServerFn } from "@tanstack/react-start";

export interface NewsArticle {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
  imageUrl: string | null;
  source: string;
}

const FEEDS = [
  { url: "https://www.estateagenttoday.co.uk/feed/", source: "Estate Agent Today" },
  { url: "https://propertyindustryeye.com/feed/", source: "Property Industry Eye" },
  { url: "https://www.landlordzone.co.uk/feed/", source: "Landlord Zone" },
  { url: "https://www.lettingagenttoday.co.uk/feed/", source: "Letting Agent Today" },
  { url: "https://www.property118.com/feed/", source: "Property 118" },
  { url: "https://www.thisismoney.co.uk/money/mortgageshome/news/rss.xml", source: "This is Money" },
];

function extractTag(xml: string, tag: string): string | null {
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i");
  const plainRe = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, "i");
  const m = xml.match(cdataRe) ?? xml.match(plainRe);
  return m ? m[1].trim() : null;
}

function extractImage(itemXml: string): string | null {
  const enclosure = itemXml.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image/i)?.[1] ?? null;
  if (enclosure) return enclosure;
  const mediaThumbnail = itemXml.match(/<media:thumbnail[^>]+url="([^"]+)"/i)?.[1] ?? null;
  if (mediaThumbnail) return mediaThumbnail;
  const mediaContent = itemXml.match(/<media:content[^>]+url="([^"]+)"[^>]*medium="image"/i)?.[1] ?? null;
  if (mediaContent) return mediaContent;
  const imgSrc = itemXml.match(/<img[^>]+src="(https?:\/\/[^"]+\.(jpe?g|png|webp)[^"]*)"/i)?.[1] ?? null;
  return imgSrc;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRss(xml: string, sourceName: string): NewsArticle[] {
  const itemMatches = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? [];
  return itemMatches.slice(0, 8).map((item) => {
    const title = stripHtml(extractTag(item, "title") ?? "");
    const link = extractTag(item, "link") ?? extractTag(item, "guid") ?? "";
    const rawDesc = extractTag(item, "description") ?? extractTag(item, "content:encoded") ?? "";
    const description = stripHtml(rawDesc).slice(0, 400);
    const pubDate = extractTag(item, "pubDate") ?? extractTag(item, "dc:date") ?? null;
    const imageUrl = extractImage(item);
    return { title, link, description, pubDate, imageUrl, source: sourceName };
  }).filter((a) => a.title && a.link);
}

async function fetchFeed(feedUrl: string, sourceName: string): Promise<NewsArticle[]> {
  try {
    const r = await fetch(feedUrl, {
      headers: { "User-Agent": "DealSource/1.0 RSS reader", Accept: "application/rss+xml, application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const text = await r.text();
    return parseRss(text, sourceName);
  } catch {
    return [];
  }
}

export const fetchPropertyNews = createServerFn({ method: "GET" })
  .handler(async () => {
    const results = await Promise.allSettled(
      FEEDS.map((f) => fetchFeed(f.url, f.source)),
    );
    const articles: NewsArticle[] = results
      .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      .filter((a) => a.title && a.link);

    // Sort by publication date (most recent first), articles without dates go last.
    articles.sort((a, b) => {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    });

    return articles.slice(0, 30);
  });
