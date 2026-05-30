"use client";

import React, { useEffect, useState, useRef } from "react";

interface TikTokPost {
  url: string;
  thumbnailUrl?: string;
  title?: string;
  authorName?: string;
}

interface Props {
  instagramUrls: string[];
  tiktokUrls: string[];
  displayCount: number;
  artisanName: string;
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

// Detect whether an Instagram URL is a post vs a profile
function isInstagramPost(url: string) {
  return /instagram\.com\/(p|reel|tv)\//.test(url);
}

// Instagram native embed card (blockquote + embed.js)
function InstagramEmbed({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trigger Instagram embed.js to process this blockquote
    if (typeof window !== "undefined") {
      const ig = (window as Window & { instgrm?: { Embeds?: { process?: () => void } } }).instgrm;
      if (ig?.Embeds?.process) {
        ig.Embeds.process();
      } else {
        // Load embed.js if not present
        if (!document.querySelector('script[src*="instagram.com/embed.js"]')) {
          const s = document.createElement("script");
          s.src = "https://www.instagram.com/embed.js";
          s.async = true;
          document.body.appendChild(s);
        }
      }
    }
  }, [url]);

  return (
    <div ref={ref} style={{ maxWidth: 320, width: "100%" }}>
      <blockquote
        className="instagram-media"
        data-instgrm-permalink={url}
        data-instgrm-version="14"
        data-instgrm-captioned
        style={{
          background: "#fff",
          border: "1px solid #ede8df",
          borderRadius: 10,
          margin: 0,
          maxWidth: "100%",
          minWidth: 280,
          padding: 0,
        }}
      />
    </div>
  );
}

export default function ArtisanSocialPosts({ instagramUrls, tiktokUrls, displayCount, artisanName }: Props) {
  const [tiktokPosts, setTiktokPosts] = useState<TikTokPost[]>([]);
  const [loadingTt, setLoadingTt] = useState(tiktokUrls.length > 0);

  // Separate post URLs from profile URLs
  const igPostUrls = instagramUrls.filter(isInstagramPost).slice(0, displayCount);
  const igProfileUrls = instagramUrls.filter(u => !isInstagramPost(u));
  const ttUrls = tiktokUrls.slice(0, Math.max(0, displayCount - igPostUrls.length));

  useEffect(() => {
    if (ttUrls.length === 0) { setLoadingTt(false); return; }
    fetch(`/api/shop/oembed?urls=${ttUrls.map(encodeURIComponent).join(",")}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.posts) {
          setTiktokPosts(
            data.posts
              .filter((p: { error?: string; thumbnailUrl?: string }) => !p.error && p.thumbnailUrl)
              .map((p: { url: string; thumbnailUrl?: string; title?: string; authorName?: string }) => ({
                url: p.url, thumbnailUrl: p.thumbnailUrl, title: p.title, authorName: p.authorName,
              }))
          );
        }
        setLoadingTt(false);
      })
      .catch(() => setLoadingTt(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttUrls.join(",")]);

  const hasContent = igPostUrls.length > 0 || igProfileUrls.length > 0 || tiktokPosts.length > 0 || loadingTt;
  if (!hasContent) return null;

  return (
    <section style={{ maxWidth: 1200, margin: "0 auto 64px", padding: "0 20px" }}>
      <style>{`@keyframes shimmer { 0% { background-position: -200px 0 } 100% { background-position: calc(200px + 100%) 0 } }`}</style>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 600, color: "#3a2e24", marginBottom: 24 }}>
        Follow {artisanName}
      </h2>

      {/* TikTok thumbnail grid */}
      {(tiktokPosts.length > 0 || loadingTt) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
          {loadingTt && tiktokPosts.length === 0
            ? Array.from({ length: Math.min(ttUrls.length, 3) }).map((_, i) => (
                <div key={i} style={{ aspectRatio: "9/16", borderRadius: 10, background: "linear-gradient(90deg,#f0ede8 25%,#ebe7e0 50%,#f0ede8 75%)", backgroundSize: "200px 100%", animation: "shimmer 1.5s infinite" }} />
              ))
            : tiktokPosts.map(post => (
                <a key={post.url} href={post.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block" }}>
                  <div style={{ position: "relative", aspectRatio: "9/16", borderRadius: 10, overflow: "hidden", background: "#1a1a1a" }}>
                    {post.thumbnailUrl && (
                      <img src={post.thumbnailUrl} alt={post.title ?? `${artisanName} on TikTok`} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.3s" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLImageElement).style.transform = "scale(1.05)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLImageElement).style.transform = "scale(1)"; }}
                      />
                    )}
                    <div style={{ position: "absolute", top: 8, left: 8, background: "#010101", color: "#fff", borderRadius: 6, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }}>
                      <TikTokIcon />
                    </div>
                    {post.title && (
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)", padding: "24px 10px 10px" }}>
                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#fff", margin: 0, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {post.title}
                        </p>
                      </div>
                    )}
                  </div>
                </a>
              ))
          }
        </div>
      )}

      {/* Instagram native embeds (post URLs) */}
      {igPostUrls.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: igProfileUrls.length > 0 ? 24 : 0 }}>
          {igPostUrls.map(url => (
            <InstagramEmbed key={url} url={url} />
          ))}
          <script async src="https://www.instagram.com/embed.js" />
        </div>
      )}

      {/* Profile URL fallback — just link cards */}
      {igProfileUrls.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {igProfileUrls.map(url => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" style={{
              display: "flex", alignItems: "center", gap: 10, padding: "14px 20px",
              background: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
              borderRadius: 10, textDecoration: "none", color: "#fff",
            }}>
              <InstagramIcon size={20} />
              <div>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, margin: 0 }}>Follow on Instagram</p>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, margin: "2px 0 0", opacity: 0.85 }}>
                  {url.replace("https://www.instagram.com/", "@").replace(/\/$/, "")}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
