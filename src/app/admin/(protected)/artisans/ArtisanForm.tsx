"use client";

import React, { useState, useCallback } from "react";
import dynamic from "next/dynamic";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });
import Image from "next/image";
import { useRouter } from "next/navigation";

export interface ArtisanData {
  id?: string;
  slug?: string;
  name?: string;
  status?: "DRAFT" | "ACTIVE";
  tagline?: string;
  quote?: string;
  story?: string;
  heroImageUrl?: string | null;
  avatarUrl?: string | null;
  originCountry?: string;
  city?: string;
  region?: string;
  craft?: string;
  practicingSince?: number | null;
  letterToBuyer?: string;
  socialLinks?: { instagram?: string; facebook?: string; tiktok?: string; youtube?: string; website?: string } | null;
  featuredPosts?: { instagram?: string[]; tiktok?: string[]; displayCount?: number } | null;
  showGallery?: boolean;
  socialEmbedCode?: string | null;
  socialLinksVisible?: { instagram?: boolean; facebook?: boolean; tiktok?: boolean; youtube?: boolean; website?: boolean } | null;
  metaTitle?: string;
  metaDescription?: string;
  isFeatured?: boolean;
  storyLabel?: string | null;
  images?: ArtisanImageData[];
}

interface ArtisanImageData {
  id?: string;
  url: string;
  urlThumb?: string | null;
  urlMedium?: string | null;
  altText?: string | null;
  caption?: string | null;
  category?: string;
  position?: number;
}

interface Props { artisan?: ArtisanData; }

const sectionCard: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: "1px solid #ede8df",
  padding: "24px", marginBottom: 20,
};
const labelStyle: React.CSSProperties = {
  display: "block", fontFamily: "'Inter', sans-serif", fontSize: 12,
  fontWeight: 600, color: "#5a4a38", marginBottom: 6, letterSpacing: "0.04em",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", border: "1.5px solid #e0d5c5",
  borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 14,
  color: "#3a2e24", outline: "none", boxSizing: "border-box", background: "#faf7f2",
};

export default function ArtisanForm({ artisan }: Props) {
  const router = useRouter();
  const isEdit = !!artisan?.id;

  const [name, setName] = useState(artisan?.name ?? "");
  const [slug, setSlug] = useState(artisan?.slug ?? "");
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE">(artisan?.status ?? "DRAFT");
  const [tagline, setTagline] = useState(artisan?.tagline ?? "");
  const [quote, setQuote] = useState(artisan?.quote ?? "");
  const [story, setStory] = useState(artisan?.story ?? "");
  const [storyLabel, setStoryLabel] = useState(artisan?.storyLabel ?? "Their Story");
  const [heroImageUrl, setHeroImageUrl] = useState(artisan?.heroImageUrl ?? "");
  const [avatarUrl, setAvatarUrl] = useState(artisan?.avatarUrl ?? "");
  const [originCountry, setOriginCountry] = useState(artisan?.originCountry ?? "El Salvador");
  const [city, setCity] = useState(artisan?.city ?? "");
  const [craft, setCraft] = useState(artisan?.craft ?? "");
  const [letterToBuyer, setLetterToBuyer] = useState(artisan?.letterToBuyer ?? "");
  const [socialInstagram, setSocialInstagram] = useState(artisan?.socialLinks?.instagram ?? "");
  const [socialFacebook, setSocialFacebook] = useState(artisan?.socialLinks?.facebook ?? "");
  const [socialTiktok, setSocialTiktok] = useState(artisan?.socialLinks?.tiktok ?? "");
  const [socialYoutube, setSocialYoutube] = useState(artisan?.socialLinks?.youtube ?? "");
  const [socialWebsite, setSocialWebsite] = useState(artisan?.socialLinks?.website ?? "");
  const [showGallery, setShowGallery] = useState(artisan?.showGallery ?? true);
  const [slvInstagram, setSlvInstagram] = useState(artisan?.socialLinksVisible?.instagram ?? true);
  const [slvFacebook, setSlvFacebook] = useState(artisan?.socialLinksVisible?.facebook ?? true);
  const [slvTiktok, setSlvTiktok] = useState(artisan?.socialLinksVisible?.tiktok ?? true);
  const [slvYoutube, setSlvYoutube] = useState(artisan?.socialLinksVisible?.youtube ?? true);
  const [slvWebsite, setSlvWebsite] = useState(artisan?.socialLinksVisible?.website ?? true);
  const [metaTitle, setMetaTitle] = useState(artisan?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(artisan?.metaDescription ?? "");
  const [isFeatured, setIsFeatured] = useState(artisan?.isFeatured ?? false);
  const [images, setImages] = useState<ArtisanImageData[]>(artisan?.images ?? []);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);

  function showToast(msg: string, error = false) {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3500);
  }

  function autoSlug(n: string) {
    return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  const uploadImage = useCallback(async (file: File, context?: string): Promise<{ url: string; urlThumb: string; urlMedium: string; altText?: string | null } | null> => {
    const fd = new FormData();
    fd.append("file", file);
    if (name) fd.append("productName", name);
    if (context) fd.append("variantHint", context);
    try {
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      if (!res.ok) { showToast("Upload failed", true); return null; }
      return await res.json();
    } catch { showToast("Upload failed", true); return null; }
  }, [name]);

  async function handleHeroUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingHero(true);
    const data = await uploadImage(file, "hero image");
    if (data) setHeroImageUrl(data.url);
    setUploadingHero(false);
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    const data = await uploadImage(file, "portrait photo");
    if (data) setAvatarUrl(data.url);
    setUploadingAvatar(false);
  }

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploadingGallery(true);
    for (const file of files) {
      const data = await uploadImage(file, "gallery photo");
      if (data) {
        setImages(prev => [...prev, {
          url: data.url,
          urlThumb: data.urlThumb,
          urlMedium: data.urlMedium,
          altText: data.altText ?? null,
          caption: null,
          category: "GALLERY",
          position: prev.length,
        }]);
      }
    }
    setUploadingGallery(false);
  }

  // Checklist
  const checklist = {
    hero: !!heroImageUrl,
    avatar: !!avatarUrl,
    story: story.replace(/<[^>]+>/g, "").trim().length > 50,
    city: !!city,
  };
  const checklistPassed = Object.values(checklist).every(Boolean);

  async function handleSubmit(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault();
    // Only block if actively switching TO active from draft (not already-active edits)
    const wasAlreadyActive = artisan?.status === "ACTIVE";
    if (status === "ACTIVE" && !wasAlreadyActive && !checklistPassed) {
      showToast("Complete the profile checklist before publishing", true);
      return;
    }
    setSaving(true);
    const body = {
      name, slug: slug || autoSlug(name), status, tagline, quote, story,
      heroImageUrl: heroImageUrl || null,
      avatarUrl: avatarUrl || null,
      originCountry, city, craft,
      letterToBuyer,
      showGallery,
      socialLinksVisible: {
        instagram: slvInstagram,
        facebook: slvFacebook,
        tiktok: slvTiktok,
        youtube: slvYoutube,
        website: slvWebsite,
      },
      socialLinks: {
        instagram: socialInstagram || undefined,
        facebook: socialFacebook || undefined,
        tiktok: socialTiktok || undefined,
        youtube: socialYoutube || undefined,
        website: socialWebsite || undefined,
      },
      storyLabel: storyLabel || "Their Story",
      metaTitle, metaDescription, isFeatured,
      images: images.map((img, i) => ({ ...img, position: i })),
    };
    try {
      const url = isEdit ? `/api/admin/artisans/${artisan!.id}` : "/api/admin/artisans";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); showToast(d.error ?? "Save failed", true); return; }
      const data = await res.json();
      showToast(isEdit ? "Saved!" : "Artisan created!");
      if (!isEdit) router.push(`/admin/artisans/${data.artisan.id}/edit`);
    } catch { showToast("Save failed", true); }
    finally { setSaving(false); }
  }

  return (
    <div className="af-container" style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px" }}>
      <style>{`
        @media (max-width: 639px) {
          .af-container { padding: 20px 12px !important; }
          .af-section-card { padding: 14px !important; }
          .af-header { flex-wrap: wrap !important; gap: 10px !important; }
          .af-header h1 { font-size: 22px !important; word-break: break-word !important; }
        }
      `}</style>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 20px", borderRadius: 8, background: toast.error ? "#c0392b" : "#27ae60", color: "#fff", fontFamily: "'Inter', sans-serif", fontSize: 14, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
          {toast.msg}
        </div>
      )}

      <div className="af-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, color: "#2a1f14", margin: 0 }}>
          {isEdit ? `Edit — ${artisan!.name}` : "New Artisan"}
        </h1>
        <div style={{ display: "flex", gap: 10 }}>
          {isEdit && artisan?.slug && status === "ACTIVE" && (
            <a href={`/artisans/${artisan.slug}`} target="_blank" rel="noopener noreferrer" style={{ padding: "10px 16px", border: "1.5px solid #8B6914", borderRadius: 8, color: "#8B6914", textDecoration: "none", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500 }}>
              View Profile ↗
            </a>
          )}
          <button type="button" onClick={handleSubmit} disabled={saving} style={{ padding: "10px 24px", background: saving ? "#c9b99a" : "#8B6914", border: "none", borderRadius: 8, color: "#fff", fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="admin-grid-sidebar-sm" style={{ gap: 20 }}>
          <div>

            {/* Basic Info */}
            <div className="af-section-card" style={sectionCard}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: "#2a1f14", margin: "0 0 16px" }}>Basic Info</h2>
              <label style={labelStyle}>Name *</label>
              <input value={name} onChange={e => { setName(e.target.value); if (!isEdit) setSlug(autoSlug(e.target.value)); }} required style={{ ...inputStyle, marginBottom: 14 }} placeholder="Rosa Maria Zamora" />
              <label style={labelStyle}>Slug</label>
              <input value={slug} onChange={e => setSlug(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} placeholder="auto-generated" />
              <label style={labelStyle}>Tagline</label>
              <input value={tagline} onChange={e => setTagline(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} placeholder="Gold & Wire Jewelry from El Salvador" />
              <label style={labelStyle}>Craft / Specialty</label>
              <input value={craft} onChange={e => setCraft(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} placeholder="Wire-Wrapped Jewelry" />
              <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)} />
                Featured artisan (shown on homepage)
              </label>
            </div>

            {/* Origin */}
            <div className="af-section-card" style={sectionCard}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: "#2a1f14", margin: "0 0 16px" }}>Origin</h2>
              <div className="admin-grid-2col" style={{ gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Country</label>
                  <input value={originCountry} onChange={e => setOriginCountry(e.target.value)} style={inputStyle} placeholder="El Salvador" />
                </div>
                <div>
                  <label style={labelStyle}>City</label>
                  <input value={city} onChange={e => setCity(e.target.value)} style={inputStyle} placeholder="San Salvador" />
                </div>
              </div>

            </div>

            {/* Hero Image */}
            <div className="af-section-card" style={sectionCard}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: "#2a1f14", margin: "0 0 16px" }}>Hero Image</h2>
              {heroImageUrl && (
                <div style={{ position: "relative", width: "100%", height: 180, borderRadius: 8, overflow: "hidden", marginBottom: 12, background: "#f5f0e8" }}>
                  <Image src={heroImageUrl} alt="Hero" fill style={{ objectFit: "cover" }} sizes="600px" />
                  <button type="button" onClick={() => setHeroImageUrl("")} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: 24, height: 24, cursor: "pointer", fontSize: 14 }}>×</button>
                </div>
              )}
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", border: "1.5px dashed #c9b99a", borderRadius: 8, cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#8B6914" }}>
                {uploadingHero ? "Uploading…" : heroImageUrl ? "Change hero image" : "Upload hero image"}
                <input type="file" accept="image/*" onChange={handleHeroUpload} style={{ display: "none" }} />
              </label>
            </div>

            {/* Avatar */}
            <div className="af-section-card" style={sectionCard}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: "#2a1f14", margin: "0 0 16px" }}>Portrait / Avatar</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {avatarUrl && (
                  <div style={{ position: "relative", width: 80, height: 80, borderRadius: "50%", overflow: "hidden", border: "2px solid #ede8df", flexShrink: 0 }}>
                    <Image src={avatarUrl} alt="Avatar" fill style={{ objectFit: "cover" }} sizes="80px" />
                  </div>
                )}
                <div>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", border: "1.5px dashed #c9b99a", borderRadius: 8, cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#8B6914" }}>
                    {uploadingAvatar ? "Uploading…" : avatarUrl ? "Change portrait" : "Upload portrait"}
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: "none" }} />
                  </label>
                  {avatarUrl && <button type="button" onClick={() => setAvatarUrl("")} style={{ marginLeft: 8, background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 12 }}>Remove</button>}
                </div>
              </div>
            </div>

            {/* Story */}
            <div className="af-section-card" style={sectionCard}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
                <input
                  value={storyLabel}
                  onChange={e => setStoryLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}
                  style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: "#2a1f14", margin: 0, border: "none", borderBottom: "1.5px dashed #c9b99a", outline: "none", background: "transparent", padding: "0 0 2px", width: "auto", minWidth: 120 }}
                  placeholder="Their Story"
                />
                {!story && (
                  <button
                    type="button"
                    onClick={() => setStory(`<p>${name || "This artisan"} has been crafting handmade goods for over two decades, pouring generations of tradition into every piece.</p>\n<p>Each creation begins with carefully selected materials, shaped by hands that have mastered the craft through years of dedication.</p>\n<p>Their work reflects the rich cultural heritage of El Salvador — vibrant, enduring, and made with heart.</p>`)}
                    style={{ flexShrink: 0, padding: "6px 12px", background: "rgba(139,105,20,0.08)", border: "1px solid rgba(139,105,20,0.3)", borderRadius: 6, color: "#8B6914", fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    ✦ Seed suggestion
                  </button>
                )}
              </div>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#9a876e", margin: "0 0 10px" }}>The main narrative shown on their profile page. Supports bold, lists, headings, and more.</p>
              <RichTextEditor
                value={story}
                onChange={setStory}
                placeholder="Rosa Maria has been crafting wire-wrapped jewelry for over two decades..."
                minHeight={220}
              />
            </div>

            {/* Quote */}
            <div className="af-section-card" style={sectionCard}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: "#2a1f14", margin: "0 0 16px" }}>Pull Quote</h2>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#9a876e", margin: "0 0 10px" }}>A short quote in the artisan&apos;s own words. Displayed prominently on their profile.</p>
              <input value={quote} onChange={e => setQuote(e.target.value)} style={inputStyle} placeholder="Each piece carries a little piece of my heart." />
            </div>

            {/* Letter to Buyer */}
            <div className="af-section-card" style={sectionCard}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: "#2a1f14", margin: "0 0 16px" }}>Letter to Buyer</h2>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#9a876e", margin: "0 0 10px" }}>A personal note shown on the artisan&apos;s profile page. Keep it warm and personal.</p>
              <textarea value={letterToBuyer} onChange={e => setLetterToBuyer(e.target.value)} style={{ ...inputStyle, minHeight: 100, resize: "vertical" }} placeholder="Thank you for supporting handmade. This piece was made with care, just for you." />
            </div>

            {/* Gallery */}
            <div className="af-section-card" style={sectionCard}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: "#2a1f14", margin: 0 }}>Photo Gallery</h2>
                <button
                  type="button"
                  onClick={() => setShowGallery(!showGallery)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: showGallery ? "rgba(39,174,96,0.08)" : "rgba(154,135,110,0.1)",
                    border: `1px solid ${showGallery ? "rgba(39,174,96,0.3)" : "#e0d5c5"}`,
                    borderRadius: 6, padding: "4px 12px", cursor: "pointer",
                    fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
                    color: showGallery ? "#1a8a4a" : "#9a876e",
                  }}
                >
                  {showGallery ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>
                    </svg>
                  )}
                  {showGallery ? "Shown on profile" : "Hidden from profile"}
                </button>
              </div>
              {images.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
                  {images.map((img, idx) => (
                    <div key={idx} style={{ border: "1px solid #ede8df", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                      <div style={{ position: "relative", aspectRatio: "1", background: "#f5f0e8" }}>
                        <Image src={img.urlThumb ?? img.url} alt={img.altText ?? ""} fill style={{ objectFit: "cover" }} sizes="140px" />
                        <button type="button" onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                      </div>
                      <div style={{ padding: "6px 8px" }}>
                        <input value={img.caption ?? ""} onChange={e => setImages(prev => { const n = [...prev]; n[idx] = { ...n[idx], caption: e.target.value }; return n; })} placeholder="Caption…" style={{ width: "100%", fontSize: 10, border: "1px solid #ede8df", borderRadius: 4, padding: "2px 4px", fontFamily: "'Inter', sans-serif", boxSizing: "border-box" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", border: "1.5px dashed #c9b99a", borderRadius: 8, cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#8B6914" }}>
                {uploadingGallery ? "Uploading…" : "+ Add Photos"}
                <input type="file" accept="image/*" multiple onChange={handleGalleryUpload} style={{ display: "none" }} />
              </label>
            </div>

            {/* Social Links */}
            <div className="af-section-card" style={sectionCard}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: "#2a1f14", margin: "0 0 16px" }}>Social Links</h2>
              {[
                { label: "Instagram", value: socialInstagram, set: setSocialInstagram, placeholder: "https://instagram.com/...", visible: slvInstagram, setVisible: setSlvInstagram },
                { label: "Facebook", value: socialFacebook, set: setSocialFacebook, placeholder: "https://facebook.com/...", visible: slvFacebook, setVisible: setSlvFacebook },
                { label: "TikTok", value: socialTiktok, set: setSocialTiktok, placeholder: "https://tiktok.com/@...", visible: slvTiktok, setVisible: setSlvTiktok },
                { label: "YouTube", value: socialYoutube, set: setSocialYoutube, placeholder: "https://youtube.com/...", visible: slvYoutube, setVisible: setSlvYoutube },
                { label: "Website", value: socialWebsite, set: setSocialWebsite, placeholder: "https://...", visible: slvWebsite, setVisible: setSlvWebsite },
              ].map(({ label, value, set, placeholder, visible, setVisible }) => (
                <div key={label} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <label style={{ ...labelStyle, margin: 0 }}>{label}</label>
                    <button
                      type="button"
                      onClick={() => setVisible(!visible)}
                      title={visible ? "Shown on profile — click to hide" : "Hidden from profile — click to show"}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        background: visible ? "rgba(39,174,96,0.08)" : "rgba(154,135,110,0.1)",
                        border: `1px solid ${visible ? "rgba(39,174,96,0.3)" : "#e0d5c5"}`,
                        borderRadius: 6, padding: "3px 9px", cursor: "pointer",
                        fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600,
                        color: visible ? "#1a8a4a" : "#9a876e",
                      }}
                    >
                      {visible ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>
                        </svg>
                      )}
                      {visible ? "Shown" : "Hidden"}
                    </button>
                  </div>
                  <input value={value} onChange={e => set(e.target.value)} style={{ ...inputStyle, opacity: visible ? 1 : 0.45 }} placeholder={placeholder} type="url" />
                </div>
              ))}
            </div>

            {/* SEO */}
            <div className="af-section-card" style={sectionCard}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: "#2a1f14", margin: "0 0 16px" }}>SEO</h2>
              <label style={labelStyle}>Meta Title</label>
              <input value={metaTitle} onChange={e => setMetaTitle(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} placeholder={`${name || "Artisan"} — Artisans Stories`} />
              <label style={labelStyle}>Meta Description</label>
              <textarea value={metaDescription} onChange={e => setMetaDescription(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} placeholder="Handcrafted goods by…" />
            </div>

          </div>

          {/* Sidebar */}
          <div style={{ position: "sticky", top: 24 }}>
            {/* Status */}
            <div className="af-section-card" style={{ ...sectionCard, marginBottom: 16 }}>
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 600, color: "#2a1f14", margin: "0 0 14px" }}>Status</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(["DRAFT", "ACTIVE"] as const).map((s) => (
                  <label key={s} style={{ display: "flex", alignItems: "center", gap: 10, cursor: s === "ACTIVE" && !checklistPassed && artisan?.status !== "ACTIVE" ? "not-allowed" : "pointer", opacity: s === "ACTIVE" && !checklistPassed && artisan?.status !== "ACTIVE" ? 0.5 : 1 }}>
                    <input type="radio" name="status" value={s} checked={status === s} onChange={() => { if (s === "ACTIVE" && !checklistPassed && artisan?.status !== "ACTIVE") { showToast("Complete the checklist to publish", true); return; } setStatus(s); }} />
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: "#3a2e24" }}>
                      {s === "DRAFT" ? "Draft" : "Active (Published)"}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Story Checklist */}
            <div className="af-section-card" style={{ ...sectionCard, marginBottom: 0 }}>
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 600, color: "#2a1f14", margin: "0 0 14px" }}>Profile Checklist</h3>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#9a876e", margin: "0 0 12px" }}>Required before publishing</p>
              {[
                { label: "Hero image", done: checklist.hero },
                { label: "Portrait photo", done: checklist.avatar },
                { label: "Story written", done: checklist.story },
{ label: "City / origin set", done: checklist.city },
              ].map(({ label, done }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, color: done ? "#27ae60" : "#c9b99a" }}>{done ? "✓" : "○"}</span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: done ? "#3a2e24" : "#9a876e", textDecoration: done ? "none" : "none" }}>{label}</span>
                </div>
              ))}
              {checklistPassed && (
                <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(39,174,96,0.08)", borderRadius: 6, fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#1a8a4a", fontWeight: 600 }}>
                  ✓ Ready to publish
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
