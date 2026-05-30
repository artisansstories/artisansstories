"use client";

import React, { useEffect, useState } from "react";

interface IGPost {
  id: string;
  url: string;
  imageUrl?: string;
  caption?: string;
  isVideo?: boolean;
}

interface TikTokPost {
  url: string;
  thumbnailUrl?: string;
  title?: string;
}

interface Props {
  artisanSlug: string;
  tiktokUrls: string[];
  displayCount: number;
  artisanName: string;
  igConnected: boolean;
}

function InstagramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  );
}

function TikTokIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/>
    </svg>
  );
}

function PostCard({ url, imageUrl, caption, isVideo, platform }: {
  url: string; imageUrl?: string; caption?: string; isVideo?: boolean; platform: "instagram" | "tiktok";
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: "none", display: "block" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        position: "relative",
        aspectRatio: "1",
        borderRadius: 10,
        overflow: "hidden",
        background: "#f5f0e8",
        cursor: "pointer",
      }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={caption ?? `${platform} post`}
            style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.3s", transform: hovered ? "scale(1.05)" : "scale(1)" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #3a2e24, #8B6914)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {platform === "instagram" ? <InstagramIcon size={32} /> : <TikTokIcon size={32} />}
          </div>
        )}
        {/* Platform badge */}
        <div style={{
          position: "absolute", top: 8, left: 8,
          background: platform === "instagram"
            ? "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)"
            : "#010101",
          color: "#fff", borderRadius: 6, padding: "4px 7px",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          {platform === "instagram" ? <InstagramIcon size={11} /> : <TikTokIcon size={11} />}
          {isVideo && <span style={{ fontSize: 9, fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>▶</span>}
        </div>
        {/* Caption overlay on hover */}
        {caption && hovered && (
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)",
            display: "flex", alignItems: "flex-end",
            padding: "20px 10px 10px",
          }}>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#fff", margin: 0, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
              {caption}
            </p>
          </div>
        )}
      </div>
    </a>
  );
}

export default function ArtisanSocialPosts({ artisanSlug, tiktokUrls, displayCount, artisanName, igConnected }: Props) {
  const [igPosts, setIgPosts] = useState<IGPost[]>([]);
  const [tiktokPosts, setTiktokPosts] = useState<TikTokPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetches: Promise<void>[] = [];

    if (igConnected) {
      fetches.push(
        fetch(`/api/shop/instagram/${artisanSlug}?limit=${displayCount}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.posts) setIgPosts(d.posts); })
          .catch(() => {})
      );
    }

    if (tiktokUrls.length > 0) {
      const ttLimit = igConnected ? Math.max(0, displayCount - igPosts.length) : displayCount;
      if (ttLimit > 0) {
        fetches.push(
          fetch(`/api/shop/oembed?urls=${tiktokUrls.slice(0, ttLimit).map(encodeURIComponent).join(",")}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (d?.posts) setTiktokPosts(d.posts.filter((p: { error?: string; thumbnailUrl?: string }) => !p.error && p.thumbnailUrl));
            })
            .catch(() => {})
        );
      }
    }

    if (fetches.length === 0) { setLoading(false); return; }
    Promise.all(fetches).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artisanSlug, igConnected, tiktokUrls.join(","), displayCount]);

  const hasContent = igPosts.length > 0 || tiktokPosts.length > 0;

  if (loading) {
    return (
      <section style={{ maxWidth: 1200, margin: "0 auto 64px", padding: "0 20px" }}>
        <style>{`@keyframes shimmer{0%{background-position:-200px 0}100%{background-position:calc(200px + 100%) 0}}`}</style>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px,4vw,36px)", fontWeight: 600, color: "#3a2e24", marginBottom: 24 }}>Follow {artisanName}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {Array.from({ length: Math.min(displayCount, 6) }).map((_, i) => (
            <div key={i} style={{ aspectRatio: "1", borderRadius: 10, background: "linear-gradient(90deg,#f0ede8 25%,#ebe7e0 50%,#f0ede8 75%)", backgroundSize: "200px 100%", animation: "shimmer 1.5s infinite" }} />
          ))}
        </div>
      </section>
    );
  }

  if (!hasContent) return null;

  const allPosts = [
    ...igPosts.map(p => ({ ...p, platform: "instagram" as const })),
    ...tiktokPosts.map(p => ({ url: p.url, imageUrl: p.thumbnailUrl, caption: p.title, isVideo: true, platform: "tiktok" as const })),
  ].slice(0, displayCount);

  return (
    <section style={{ maxWidth: 1200, margin: "0 auto 64px", padding: "0 20px" }}>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px,4vw,36px)", fontWeight: 600, color: "#3a2e24", marginBottom: 24 }}>
        Follow {artisanName}
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {allPosts.map(post => (
          <PostCard
            key={post.url}
            url={post.url}
            imageUrl={post.imageUrl}
            caption={post.caption}
            isVideo={post.isVideo}
            platform={post.platform}
          />
        ))}
      </div>
    </section>
  );
}
