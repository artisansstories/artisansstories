import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface IGMedia {
  id: string;
  media_type: string;
  media_url: string;
  thumbnail_url?: string;
  permalink: string;
  caption?: string;
  timestamp: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "9");

  const artisan = await prisma.artisan.findUnique({
    where: { slug, status: "ACTIVE" },
    select: { igAccessToken: true, igTokenExpiry: true, igUserId: true, featuredPosts: true },
  });

  if (!artisan?.igAccessToken) {
    return NextResponse.json({ posts: [], connected: false });
  }

  // Check token expiry
  if (artisan.igTokenExpiry && artisan.igTokenExpiry < new Date()) {
    return NextResponse.json({ posts: [], connected: false, expired: true });
  }

  try {
    const fields = "id,media_type,media_url,thumbnail_url,permalink,caption,timestamp";
    const res = await fetch(
      `https://graph.instagram.com/me/media?fields=${fields}&limit=${limit}&access_token=${artisan.igAccessToken}`,
      { next: { revalidate: 300 } } // cache 5 min
    );

    if (!res.ok) {
      const err = await res.json() as { error?: { message?: string } };
      console.error("[IG posts]", err);
      return NextResponse.json({ posts: [], connected: true, error: err.error?.message });
    }

    const data = await res.json() as { data: IGMedia[] };
    const posts = data.data
      .filter(p => p.media_type !== "VIDEO" || p.thumbnail_url) // skip videos without thumbnail
      .map(p => ({
        id: p.id,
        url: p.permalink,
        imageUrl: p.media_type === "VIDEO" ? p.thumbnail_url : p.media_url,
        caption: p.caption,
        timestamp: p.timestamp,
        isVideo: p.media_type === "VIDEO",
      }));

    return NextResponse.json({ posts, connected: true });
  } catch (err) {
    console.error("[IG posts fetch]", err);
    return NextResponse.json({ posts: [], connected: true, error: "Fetch failed" });
  }
}
