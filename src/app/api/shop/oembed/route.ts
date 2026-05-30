import { NextRequest, NextResponse } from "next/server";

export interface OEmbedResult {
  url: string;
  platform: "instagram" | "tiktok";
  thumbnailUrl?: string;
  title?: string;
  authorName?: string;
  authorUrl?: string;
  html?: string;
  width?: number;
  height?: number;
  error?: string;
}

async function fetchTikTokOEmbed(url: string): Promise<OEmbedResult> {
  try {
    const apiUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await fetch(apiUrl, { next: { revalidate: 3600 } });
    if (!res.ok) return { url, platform: "tiktok", error: "Failed to fetch" };
    const data = await res.json() as {
      thumbnail_url?: string;
      title?: string;
      author_name?: string;
      author_url?: string;
      html?: string;
      thumbnail_width?: number;
      thumbnail_height?: number;
    };
    return {
      url,
      platform: "tiktok",
      thumbnailUrl: data.thumbnail_url,
      title: data.title,
      authorName: data.author_name,
      authorUrl: data.author_url,
      html: data.html,
      width: data.thumbnail_width,
      height: data.thumbnail_height,
    };
  } catch {
    return { url, platform: "tiktok", error: "Network error" };
  }
}

async function fetchInstagramOEmbed(url: string): Promise<OEmbedResult> {
  try {
    // Try public oEmbed endpoint (works without token for public posts)
    const apiUrl = `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(url)}&maxwidth=400`;
    const token = process.env.FACEBOOK_APP_TOKEN;
    const fullUrl = token ? `${apiUrl}&access_token=${token}` : apiUrl;
    const res = await fetch(fullUrl, { next: { revalidate: 3600 } });
    if (!res.ok) {
      // Fallback: return placeholder so UI can show native embed
      return { url, platform: "instagram", error: "Token required" };
    }
    const data = await res.json() as {
      thumbnail_url?: string;
      title?: string;
      author_name?: string;
      author_url?: string;
      html?: string;
      width?: number;
      height?: number;
    };
    return {
      url,
      platform: "instagram",
      thumbnailUrl: data.thumbnail_url,
      title: data.title,
      authorName: data.author_name,
      authorUrl: data.author_url,
      html: data.html,
      width: data.width,
      height: data.height,
    };
  } catch {
    return { url, platform: "instagram", error: "Network error" };
  }
}

// GET /api/shop/oembed?urls=url1,url2&platform=instagram|tiktok
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const urlsParam = searchParams.get("urls") ?? "";
  const urls = urlsParam.split(",").map(u => u.trim()).filter(Boolean);

  if (urls.length === 0) return NextResponse.json({ posts: [] });

  const results = await Promise.all(
    urls.map(url => {
      if (url.includes("tiktok.com")) return fetchTikTokOEmbed(url);
      if (url.includes("instagram.com")) return fetchInstagramOEmbed(url);
      return Promise.resolve({ url, platform: "instagram" as const, error: "Unknown platform" });
    })
  );

  return NextResponse.json({ posts: results });
}
