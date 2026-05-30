"use client";

import React, { useEffect, useState } from "react";

interface OEmbedPost {
  url: string;
  platform: "instagram" | "tiktok";
  thumbnailUrl?: string;
  title?: string;
  authorName?: string;
  authorUrl?: string;
  error?: string;
}

interface Props {
  instagramUrls: string[];
  tiktokUrls: string[];
  displayCount: number;
  artisanName: string;
}

function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/>
    </svg>
  );
}

export default function ArtisanSocialPosts({ instagramUrls, tiktokUrls, displayCount, artisanName }: Props) {
  const [posts, setPosts] = useState<OEmbedPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const allUrls = [
      ...instagramUrls.slice(0, displayCount),
      ...tiktokUrls.slice(0, Math.max(0, displayCount - instagramUrls.length)),
    ].slice(0, displayCount);

    if (allUrls.length === 0) { setLoading(false); return; }

    fetch(`/api/shop/oembed?urls=${allUrls.map(encodeURIComponent).join(",")}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.posts) setPosts(data.posts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [instagramUrls, tiktokUrls, displayCount]);

  if (loading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {Array.from({ length: Math.min(displayCount, 3) }).map((_, i) => (
          <div key={i} style={{ aspectRatio: "1", borderRadius: 10, background: "linear-gradient(90deg,#f0ede8 25%,#ebe7e0 50%,#f0ede8 75%)", backgroundSize: "200px 100%", animation: "shimmer 1.5s infinite" }} />
        ))}
      </div>
    );
  }

  const validPosts = posts.filter(p => !p.error && p.thumbnailUrl);
  // Fall back to native embeds for posts without thumbnails
  const nativeEmbedPosts = posts.filter(p => p.error === "Token required");

  if (validPosts.length === 0 && nativeEmbedPosts.length === 0) return null;

  return (
    <section style={{ maxWidth: 1200, margin: "0 auto 64px", padding: "0 20px" }}>
      <style>{`@keyframes shimmer { 0% { background-position: -200px 0 } 100% { background-position: calc(200px + 100%) 0 } }`}</style>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 600, color: "#3a2e24", marginBottom: 24 }}>
        Follow {artisanName}
      </h2>

      {/* Custom styled thumbnail grid */}
      {validPosts.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: nativeEmbedPosts.length > 0 ? 24 : 0,
        }}>
          {validPosts.map((post) => (
            <a
              key={post.url}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none", display: "block" }}
            >
              <div style={{
                position: "relative",
                aspectRatio: "1",
                borderRadius: 10,
                overflow: "hidden",
                background: "#f5f0e8",
                cursor: "pointer",
              }}>
                <img
                  src={post.thumbnailUrl}
                  alt={post.title ?? `${artisanName} on ${post.platform}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.3s", display: "block" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLImageElement).style.transform = "scale(1.05)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLImageElement).style.transform = "scale(1)"; }}
                />
                {/* Platform badge */}
                <div style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  background: post.platform === "instagram"
                    ? "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)"
                    : "#010101",
                  color: "#fff",
                  borderRadius: 6,
                  padding: "4px 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}>
                  {post.platform === "instagram" ? <InstagramIcon /> : <TikTokIcon />}
                </div>
                {/* Hover overlay */}
                <div style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0)",
                  transition: "background 0.2s",
                  display: "flex",
                  alignItems: "flex-end",
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.35)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0)"; }}
                >
                  {post.title && (
                    <p style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 12,
                      color: "#fff",
                      padding: "20px 10px 10px",
                      margin: 0,
                      lineHeight: 1.3,
                      background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)",
                      width: "100%",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}>
                      {post.title}
                    </p>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Native Instagram embeds fallback when no token */}
      {nativeEmbedPosts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          {nativeEmbedPosts.map(post => (
            <blockquote
              key={post.url}
              className="instagram-media"
              data-instgrm-permalink={post.url}
              data-instgrm-version="14"
              style={{ maxWidth: 300, minWidth: 220, width: "100%", borderRadius: 10, border: "1px solid #ede8df" }}
            />
          ))}
          <script async src="//www.instagram.com/embed.js" />
        </div>
      )}
    </section>
  );
}
