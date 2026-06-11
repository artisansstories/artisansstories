"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import RichTextEditor from "@/components/RichTextEditor";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductImage {
  id?: string;
  url: string;
  urlThumb?: string | null;
  urlMedium?: string | null;
  altText?: string | null;
  position: number;
  isDefault: boolean;
  width?: number | null;
  height?: number | null;
  size?: number | null;
  variantId?: string | null;
}

export interface ProductVariantRow {
  id?: string;
  name: string;
  sku?: string;
  price?: number | null;
  quantity: number;
  optionValues: Record<string, string>;
  position: number;
}

export interface ProductOption {
  id?: string;
  name: string;
  values: string[];
  position: number;
}

export interface ProductData {
  id?: string;
  name: string;
  slug: string;
  description?: string;
  story?: string;
  price: number;
  compareAtPrice?: number | null;
  discountType?: "PERCENTAGE" | "FIXED" | null;
  costPrice?: number | null;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  categoryIds: string[];
  tags: string[];
  artisanName?: string;
  artisanId?: string | null;
  originCountry: string;
  materialsUsed: string[];
  requiresShipping: boolean;
  weight?: number | null;
  weightUnit: string;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  dimensionUnit: string;
  sku?: string | null;
  seoTitle?: string;
  seoDescription?: string;
  isFeatured?: boolean;
  images: ProductImage[];
  variants: ProductVariantRow[];
  options: ProductOption[];
}

interface CategoryOption {
  id: string;
  name: string;
}

interface ArtisanOption {
  id: string;
  name: string;
}

interface ProductFormProps {
  product?: ProductData;
  artisans?: ArtisanOption[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function cartesian(arrays: string[][]): string[][] {
  if (arrays.length === 0) return [[]];
  return arrays.reduce<string[][]>(
    (acc, cur) => acc.flatMap((a) => cur.map((v) => [...a, v])),
    [[]]
  );
}

// ─── Reusable UI pieces ───────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 16, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif", marginBottom: 16, paddingBottom: 10, borderBottom: "1px solid #ede8df" }}>
      {children}
    </h2>
  );
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter', sans-serif", marginBottom: 5 }}>
      {children}{required && <span style={{ color: "#b91c1c", marginLeft: 3 }}>*</span>}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid #ede8df",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "'Inter', sans-serif",
  color: "#3a2e24",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  lineHeight: 1.6,
};

function TagInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [inputVal, setInputVal] = useState("");
  function add() {
    const trimmed = inputVal.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInputVal("");
  }
  return (
    <div style={{ border: "1px solid #ede8df", borderRadius: 8, padding: "6px 10px", background: "#fff", display: "flex", flexWrap: "wrap", gap: 6, minHeight: 42, alignItems: "center" }}>
      {values.map((v) => (
        <span key={v} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#fdf5ea", border: "1px solid #e8d5a3", borderRadius: 20, padding: "2px 10px", fontSize: 13, color: "#6b4c14", fontFamily: "'Inter', sans-serif" }}>
          {v}
          <button type="button" onClick={() => onChange(values.filter((t) => t !== v))} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#8B6914", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
        </span>
      ))}
      <input
        type="text"
        value={inputVal}
        placeholder={placeholder ?? "Type and press Enter"}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        onBlur={add}
        style={{ border: "none", outline: "none", fontSize: 13, fontFamily: "'Inter', sans-serif", flex: 1, minWidth: 80, background: "transparent", color: "#3a2e24" }}
      />
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 42, height: 24, borderRadius: 12,
          background: checked ? "#8B6914" : "#d1c4b4",
          position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0,
        }}
      >
        <div style={{
          position: "absolute", top: 3, left: checked ? 21 : 3, width: 18, height: 18,
          borderRadius: "50%", background: "#fff",
          transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </div>
      <span style={{ fontSize: 14, fontFamily: "'Inter', sans-serif", color: "#3a2e24" }}>{label}</span>
    </label>
  );
}

// ─── Main Form ────────────────────────────────────────────────────────────────

export default function ProductForm({ product, artisans = [] }: ProductFormProps) {
  const router = useRouter();
  const isEdit = !!product?.id;

  // Form state
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [story, setStory] = useState(product?.story ?? "");

  const [price, setPrice] = useState(product ? String(product.price / 100) : "");
  const [compareAtPrice, setCompareAtPrice] = useState(product?.compareAtPrice ? String(product.compareAtPrice / 100) : "");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">(product?.discountType ?? "PERCENTAGE");
  const [costPrice, setCostPrice] = useState(product?.costPrice ? String(product.costPrice / 100) : "");

  const [status, setStatus] = useState<"DRAFT" | "ACTIVE" | "ARCHIVED">(product?.status ?? "DRAFT");

  const [images, setImages] = useState<ProductImage[]>(product?.images ?? []);
  const [uploadingImages, setUploadingImages] = useState<string[]>([]);

  const [hasVariants, setHasVariants] = useState((product?.options?.length ?? 0) > 0);
  const [options, setOptions] = useState<ProductOption[]>(product?.options ?? []);
  const variantsRef = useRef<ProductVariantRow[]>([]);
  const [variants, setVariants] = useState<ProductVariantRow[]>(() => {
    const initial = product?.variants?.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku ?? undefined,
      price: v.price ?? null,
      quantity: v.quantity ?? 0,
      optionValues: (v.optionValues as Record<string, string>) ?? {},
      position: v.position,
    })) ?? [{ name: "Default", quantity: 0, optionValues: {}, position: 0 }];
    variantsRef.current = initial;
    return initial;
  });

  const [categoryIds, setCategoryIds] = useState<string[]>(product?.categoryIds ?? []);
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [tags, setTags] = useState<string[]>(product?.tags ?? []);
  const [artisanId, setArtisanId] = useState<string>(product?.artisanId ?? "");
  const [originCountry, setOriginCountry] = useState(product?.originCountry ?? "El Salvador");
  const [materialsUsed, setMaterialsUsed] = useState<string[]>(product?.materialsUsed ?? []);

  const [requiresShipping, setRequiresShipping] = useState(product?.requiresShipping ?? true);
  const [weight, setWeight] = useState(product?.weight ? String(product.weight) : "");
  const [weightUnit, setWeightUnit] = useState(product?.weightUnit ?? "oz");
  const [length, setLength] = useState(product?.length ? String(product.length) : "");
  const [width, setWidth] = useState(product?.width ? String(product.width) : "");
  const [height, setHeight] = useState(product?.height ? String(product.height) : "");
  const [dimensionUnit, setDimensionUnit] = useState(product?.dimensionUnit ?? "in");

  const [seoTitle, setSeoTitle] = useState(product?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(product?.seoDescription ?? "");

  const [sku, setSku] = useState(product?.sku ?? "");
  const [skuGenerating, setSkuGenerating] = useState(false);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  function showToast(msg: string, error = false) {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 4000);
  }

  // Load categories
  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d: { categories: CategoryOption[] }) => setAllCategories(d.categories ?? []))
      .catch(() => {});
  }, []);

  // Auto-generate slug from name (only when creating)
  function handleNameChange(val: string) {
    setName(val);
    if (!isEdit) {
      setSlug(generateSlug(val));
    }
  }

  // Keep variantsRef in sync
  useEffect(() => { variantsRef.current = variants; }, [variants]);

  // Rebuild variants when options change
  // IMPORTANT: preserves existing variant IDs by matching on name so image variantId FKs survive saves
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (!hasVariants || options.length === 0) return;
    const validOptions = options.filter((o) => o.name && o.values.length > 0);
    if (validOptions.length === 0) return;

    const combinations = cartesian(validOptions.map((o) => o.values));
    // Use ref to avoid stale closure — preserves IDs of existing variants by name
    const currentVariants = variantsRef.current;
    const newVariants: ProductVariantRow[] = combinations.map((combo, idx) => {
      const optionValues: Record<string, string> = {};
      validOptions.forEach((o, i) => { optionValues[o.name] = combo[i]; });
      const variantName = combo.join(" / ");
      // Match existing by name OR by optionValues to preserve IDs
      const existing = currentVariants.find((v) =>
        v.name === variantName ||
        Object.entries(optionValues).every(([k, val]) => v.optionValues?.[k] === val)
      );
      return {
        id: existing?.id,
        name: variantName,
        sku: existing?.sku ?? "",
        price: existing?.price ?? null,
        quantity: existing?.quantity ?? 0,
        optionValues,
        position: idx,
      };
    });
    // Skip the initial mount rebuild if all variant IDs and names already match
    // This prevents wiping image variantId assignments on page load
    if (isInitialMount.current) {
      isInitialMount.current = false;
      const alreadyMatches = newVariants.length === currentVariants.length &&
        newVariants.every((nv, i) => currentVariants[i]?.id === nv.id && currentVariants[i]?.name === nv.name);
      if (alreadyMatches) return;
    }
    // Only update if something actually changed (avoid unnecessary re-renders)
    const hasChanges = newVariants.some((nv, i) => {
      const cv = currentVariants[i];
      return !cv || cv.id !== nv.id || cv.name !== nv.name;
    }) || newVariants.length !== currentVariants.length;
    if (hasChanges) setVariants(newVariants);
  }, [options, hasVariants]);

  // ─── Image Upload ─────────────────────────────────────────────────────────

  const uploadFile = useCallback(async (file: File) => {
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    setUploadingImages((prev) => [...prev, tempId]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // Pass product context for AI alt text generation
      if (name) fd.append("productName", name);
      if (artisanId) fd.append("artisanId", artisanId);
      // Hint: first selected variant value (e.g. color being uploaded)
      const firstOption = options[0];
      if (firstOption?.name && firstOption?.values?.length > 0) {
        fd.append("variantHint", `${firstOption.name}: ${firstOption.values.join(", ")}`);
      }
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        showToast(err.error ?? "Upload failed", true);
        return;
      }
      const data = await res.json() as { url: string; urlThumb: string; urlMedium: string; width: number; height: number; size: number; altText?: string | null };
      setImages((prev) => {
        const isFirst = prev.length === 0;
        return [...prev, {
          url: data.url,
          urlThumb: data.urlThumb,
          urlMedium: data.urlMedium,
          altText: data.altText ?? null, // AI-generated, overridable
          position: prev.length,
          isDefault: isFirst,
          width: data.width,
          height: data.height,
          size: data.size,
        }];
      });
    } catch {
      showToast("Upload failed", true);
    } finally {
      setUploadingImages((prev) => prev.filter((id) => id !== tempId));
    }
  }, [name, artisanId, options]);

  function handleFilesSelected(files: FileList) {
    Array.from(files).forEach((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const heicByExt = ["heic", "heif"].includes(ext);
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type);
      if (!allowed && !heicByExt) {
        showToast(`${file.name}: invalid file type`, true);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        showToast(`${file.name}: file too large (max 10MB)`, true);
        return;
      }
      uploadFile(file);
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files) handleFilesSelected(e.dataTransfer.files);
  }

  function onImageDragEnd(result: DropResult) {
    if (!result.destination || result.destination.index === result.source.index) return;
    const next = [...images];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    // Re-assign default to first image if the default was moved
    setImages(next.map((img, i) => ({ ...img, position: i })));
  }

  function moveImage(index: number, dir: -1 | 1) {
    const next = [...images];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    next.forEach((img, i) => { img.position = i; });
    setImages(next);
  }

  function setDefaultImage(index: number) {
    setImages(images.map((img, i) => ({ ...img, isDefault: i === index })));
  }

  function removeImage(index: number) {
    const next = images.filter((_, i) => i !== index);
    next.forEach((img, i) => { img.position = i; });
    if (next.length > 0 && !next.some((img) => img.isDefault)) {
      next[0].isDefault = true;
    }
    setImages(next);
  }

  function updateAltText(index: number, text: string) {
    const next = [...images];
    next[index] = { ...next[index], altText: text };
    setImages(next);
  }

  // ─── Options ──────────────────────────────────────────────────────────────

  function addOption() {
    setOptions([...options, { name: "", values: [], position: options.length }]);
  }

  function updateOptionName(index: number, name: string) {
    const next = [...options];
    next[index] = { ...next[index], name };
    setOptions(next);
  }

  function updateOptionValues(index: number, valuesStr: string) {
    const values = valuesStr.split(",").map((v) => v.trim()).filter(Boolean);
    const next = [...options];
    next[index] = { ...next[index], values };
    setOptions(next);
  }

  function removeOption(index: number) {
    const next = options.filter((_, i) => i !== index);
    next.forEach((o, i) => { o.position = i; });
    setOptions(next);
    if (next.length === 0) setHasVariants(false);
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

  async function save(overrideStatus?: "DRAFT" | "ACTIVE") {
    if (!name.trim()) { showToast("Product name is required", true); return; }
    if (!price) { showToast("Price is required", true); return; }

    setSaving(true);
    try {
      const priceInCents = Math.round(parseFloat(price) * 100);
      const compareAtPriceInCents = compareAtPrice ? Math.round(parseFloat(compareAtPrice) * 100) : null;
      const costPriceInCents = costPrice ? Math.round(parseFloat(costPrice) * 100) : null;

      const body = {
        name: name.trim(),
        description: description || undefined,
        story: story || undefined,
        price: priceInCents,
        compareAtPrice: compareAtPriceInCents,
        discountType: compareAtPriceInCents ? discountType : null,
        costPrice: costPriceInCents,
        status: overrideStatus ?? status,
        categoryIds,
        tags,
        artisanId: artisanId || null,
        originCountry: originCountry || "El Salvador",
        materialsUsed,
        requiresShipping,
        weight: weight ? parseFloat(weight) : undefined,
        weightUnit,
        length: length ? parseFloat(length) : undefined,
        width: width ? parseFloat(width) : undefined,
        height: height ? parseFloat(height) : undefined,
        dimensionUnit,
        sku: sku.trim() || null,
        seoTitle: seoTitle || undefined,
        seoDescription: seoDescription || undefined,
        images: images.map((img, i) => ({
          url: img.url,
          urlMedium: img.urlMedium ?? null,
          urlThumb: img.urlThumb ?? null,
          altText: img.altText ?? null,
          position: i,
          isDefault: img.isDefault ?? i === 0,
          variantId: img.variantId ?? null,
        })),
        options: hasVariants ? options.filter(o => o.name && o.values.length > 0).map((o, i) => ({
          id: o.id,
          name: o.name,
          values: o.values,
          position: i,
        })) : [],
        variants: hasVariants ? variantsRef.current.map((v, i) => ({
          id: v.id,
          name: v.name,
          sku: v.sku || null,
          price: v.price ?? null,
          quantity: v.quantity ?? 0,
          optionValues: v.optionValues,
          position: i,
        })) : [],
      };

      const url = isEdit ? `/api/admin/products/${product!.id}` : "/api/admin/products";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error ?? "Save failed");
      }

      const data = await res.json() as { product: { id: string } };

      showToast(isEdit ? "Product saved!" : "Product created!");

      if (!isEdit) {
        setTimeout(() => router.push(`/admin/products/${data.product.id}/edit`), 800);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", true);
    } finally {
      setSaving(false);
    }
  }

  // ─── Price display helpers ────────────────────────────────────────────────

  const priceNum = parseFloat(price) || 0;
  const compareNum = parseFloat(compareAtPrice) || 0;
  const costNum = parseFloat(costPrice) || 0;
  const savePct = compareNum > priceNum && compareNum > 0 ? Math.round((1 - priceNum / compareNum) * 100) : 0;
  const margin = priceNum > 0 && costNum > 0 ? Math.round(((priceNum - costNum) / priceNum) * 100) : 0;

  const sectionCard: React.CSSProperties = {
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #ede8df",
    padding: "22px 24px",
    marginBottom: 18,
    boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
  };

  const fieldGroup: React.CSSProperties = { marginBottom: 16 };

  const gridTwo: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  };

  const btnPrimary: React.CSSProperties = {
    padding: "11px 22px",
    background: "#8B6914",
    color: "#fff",
    border: "none",
    borderRadius: 9,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    cursor: saving ? "not-allowed" : "pointer",
    opacity: saving ? 0.7 : 1,
    minHeight: 44,
  };

  const btnSecondary: React.CSSProperties = {
    padding: "11px 20px",
    background: "#fff",
    color: "#3a2e24",
    border: "1px solid #ede8df",
    borderRadius: 9,
    fontSize: 14,
    fontWeight: 500,
    fontFamily: "'Inter', sans-serif",
    cursor: saving ? "not-allowed" : "pointer",
    opacity: saving ? 0.7 : 1,
    minHeight: 44,
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 1000,
          background: toast.error ? "#fef2f2" : "#f0fdf4",
          border: `1px solid ${toast.error ? "#fecaca" : "#bbf7d0"}`,
          color: toast.error ? "#b91c1c" : "#15803d",
          padding: "12px 18px", borderRadius: 10,
          fontSize: 14, fontFamily: "'Inter', sans-serif",
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Page header */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/admin/products" style={{ fontSize: 13, color: "#8B6914", fontFamily: "'Inter', sans-serif", textDecoration: "none" }}>
            ← Products
          </a>
          <span style={{ color: "#c8b89a" }}>/</span>
          <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(20px,3vw,28px)", fontWeight: 500, color: "#3a2e24" }}>
            {isEdit ? (product?.name || "Edit Product") : "New Product"}
          </h1>
        </div>
      </div>

      <div className="product-form-grid admin-grid-sidebar" style={{ gap: 18, alignItems: "start" }}>

        {/* ── Left column: main content ── */}
        <div>

          {/* Section 1: Basic Info */}
          <div style={sectionCard}>
            <SectionHeading>Basic Information</SectionHeading>
            <div style={fieldGroup}>
              <Label required>Product Name</Label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Hand-woven Basket"
                style={inputStyle}
              />
              {slug && (
                <p style={{ fontSize: 12, color: "#9a876e", fontFamily: "'Inter', sans-serif", marginTop: 5 }}>
                  Slug: <span style={{ fontWeight: 500, color: "#6b5540" }}>{slug}</span>
                </p>
              )}
            </div>
            <div style={fieldGroup}>
              <Label>Description</Label>
              <RichTextEditor
                value={description}
                onChange={setDescription}
                placeholder="Describe this product..."
                minHeight={120}
              />
            </div>
            <div style={fieldGroup}>

            </div>
          </div>

          {/* Section 2: Media */}
          <div style={sectionCard}>
            <SectionHeading>Media</SectionHeading>

            {/* Drop zone */}
            <div
              ref={dropZoneRef}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = "#8B6914"; (e.currentTarget as HTMLElement).style.background = "#fdf8f0"; }}
              onDragLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#d1c4b4"; (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "2px dashed #d1c4b4",
                borderRadius: 10,
                background: "#faf7f2",
                padding: "32px 20px",
                textAlign: "center",
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
                marginBottom: 16,
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#c8b89a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 10px" }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p style={{ fontSize: 14, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter', sans-serif", marginBottom: 4 }}>
                Drop images here or click to browse
              </p>
              <p style={{ fontSize: 12, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>
                JPEG, PNG, WebP — up to 10MB each
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                style={{ display: "none" }}
                onChange={(e) => { if (e.target.files) handleFilesSelected(e.target.files); }}
              />
            </div>

            {/* Upload progress */}
            {uploadingImages.length > 0 && (
              <div style={{ marginBottom: 12, padding: "10px 14px", background: "#fdf5ea", borderRadius: 8, border: "1px solid #e8d5a3", fontSize: 13, color: "#7a5a00", fontFamily: "'Inter', sans-serif" }}>
                Uploading {uploadingImages.length} image{uploadingImages.length !== 1 ? "s" : ""}...
              </div>
            )}

            {/* Image grid — drag to reorder */}
            {images.length > 0 && (
              <DragDropContext onDragEnd={onImageDragEnd}>
                <Droppable droppableId="product-images" direction="horizontal">
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}
                    >
                      {images.map((img, idx) => (
                        <Draggable key={img.url + idx} draggableId={img.url + idx} index={idx}>
                          {(drag, snapshot) => (
                            <div
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              style={{
                                border: `2px solid ${img.isDefault ? "#8B6914" : "#ede8df"}`,
                                borderRadius: 10,
                                overflow: "hidden",
                                background: "#fff",
                                boxShadow: snapshot.isDragging ? "0 8px 24px rgba(0,0,0,0.18)" : undefined,
                                opacity: snapshot.isDragging ? 0.92 : 1,
                                cursor: "grab",
                                ...drag.draggableProps.style,
                              }}
                            >
                              {/* Drag handle header */}
                              <div
                                {...drag.dragHandleProps}
                                style={{ padding: "4px 8px", background: "#faf7f2", borderBottom: "1px solid #ede8df", display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab" }}
                              >
                                <span style={{ color: "#c9b99a", fontSize: 14, letterSpacing: 2 }}>⠿</span>
                              </div>
                              <div style={{ position: "relative", aspectRatio: "1", background: "#f5f0e8" }}>
                                <img
                                  src={img.urlThumb ?? img.url}
                                  alt={img.altText ?? ""}
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                                {img.isDefault && (
                                  <span style={{ position: "absolute", top: 6, left: 6, background: "#8B6914", color: "#fff", fontSize: 10, fontFamily: "'Inter', sans-serif", fontWeight: 600, padding: "2px 6px", borderRadius: 4 }}>
                                    DEFAULT
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeImage(idx)}
                                  style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}
                                >
                                  ×
                                </button>
                              </div>
                              <div style={{ padding: "8px 10px" }}>
                                <input
                                  type="text"
                                  value={img.altText ?? ""}
                                  onChange={(e) => updateAltText(idx, e.target.value)}
                                  placeholder="AI-generating alt text..."
                                  style={{ width: "100%", border: "1px solid #ede8df", borderRadius: 5, padding: "4px 7px", fontSize: 11, fontFamily: "'Inter', sans-serif", color: "#3a2e24", outline: "none", marginBottom: 6, boxSizing: "border-box" }}
                                />
                                {variants.length > 0 && (
                                  <select
                                    value={img.variantId ?? ""}
                                    onChange={(e) => {
                                      const next = [...images];
                                      next[idx] = { ...next[idx], variantId: e.target.value || null };
                                      setImages(next);
                                    }}
                                    style={{ width: "100%", border: "1px solid #ede8df", borderRadius: 5, padding: "4px 7px", fontSize: 10, fontFamily: "'Inter', sans-serif", color: "#3a2e24", outline: "none", marginBottom: 6, background: "#faf7f2", boxSizing: "border-box" }}
                                  >
                                    <option value="">No variant</option>
                                    {variants.map((v) => (
                                      <option key={v.id ?? v.name} value={v.id ?? ""}>
                                        {v.name}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                {!img.isDefault && (
                                  <button type="button" onClick={() => setDefaultImage(idx)} style={{ width: "100%", padding: "4px 6px", borderRadius: 5, border: "1px solid #c9a84c", background: "#fdf5ea", color: "#7a5a00", cursor: "pointer", fontSize: 10, fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
                                    Set default
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>

          {/* Section 3: Pricing */}
          <div style={sectionCard}>
            <SectionHeading>Pricing</SectionHeading>
            <div className="admin-grid-2col" style={{ marginBottom: 16 }}>
              <div>
                <Label required>Price (USD)</Label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9a876e", fontFamily: "'Inter', sans-serif", fontSize: 14 }}>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    style={{ ...inputStyle, paddingLeft: 26 }}
                  />
                </div>
              </div>
              <div style={{ width: "100%" }}>
                <Label>Compare-at Price (original / was price)</Label>
                <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap", width: "100%" }}>
                  {/* Discount type pill toggle */}
                  <div style={{ display: "flex", border: "1px solid #ede8df", borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => setDiscountType("PERCENTAGE")}
                      style={{
                        padding: "9px 12px",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 13,
                        fontWeight: 500,
                        background: discountType === "PERCENTAGE" ? "#8B6914" : "#fff",
                        color: discountType === "PERCENTAGE" ? "#fff" : "#6b5540",
                        transition: "background 0.15s",
                      }}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType("FIXED")}
                      style={{
                        padding: "9px 12px",
                        border: "none",
                        borderLeft: "1px solid #ede8df",
                        cursor: "pointer",
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 13,
                        fontWeight: 500,
                        background: discountType === "FIXED" ? "#8B6914" : "#fff",
                        color: discountType === "FIXED" ? "#fff" : "#6b5540",
                        transition: "background 0.15s",
                      }}
                    >
                      $ off
                    </button>
                  </div>
                  {/* Price input */}
                  <div style={{ position: "relative", flex: 1 }}>
                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9a876e", fontFamily: "'Inter', sans-serif", fontSize: 14 }}>$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={compareAtPrice}
                      onChange={(e) => setCompareAtPrice(e.target.value)}
                      placeholder="0.00"
                      style={{ ...inputStyle, paddingLeft: 26 }}
                    />
                  </div>
                </div>
                {/* Live preview */}
                {compareNum > priceNum && priceNum > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#aaa", textDecoration: "line-through" }}>
                      ${compareNum.toFixed(2)}
                    </span>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: "#8B6914" }}>
                      ${priceNum.toFixed(2)}
                    </span>
                    <span style={{ background: "#e74c3c", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4, fontFamily: "'Inter', sans-serif" }}>
                      {discountType === "FIXED"
                        ? (() => { const d = compareNum - priceNum; return `Save $${d % 1 === 0 ? d.toFixed(0) : d.toFixed(2)}`; })()
                        : `Save ${savePct}%`}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div style={{ maxWidth: 240 }}>
              <Label>Cost Per Item</Label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9a876e", fontFamily: "'Inter', sans-serif", fontSize: 14 }}>$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  placeholder="0.00"
                  style={{ ...inputStyle, paddingLeft: 26 }}
                />
              </div>
              {margin > 0 && (
                <p style={{ fontSize: 12, color: "#6b5540", fontFamily: "'Inter', sans-serif", marginTop: 4 }}>Margin: {margin}%</p>
              )}
            </div>
          </div>

          {/* Section: SKU */}
          <div style={sectionCard}>
            <SectionHeading>SKU</SectionHeading>
            <div style={{ marginBottom: 4 }}>
              <Label>Product SKU</Label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={sku}
                  onChange={e => setSku(e.target.value.toUpperCase())}
                  placeholder="e.g. AS-TOT-X4K2M9"
                  style={{ ...inputStyle, flex: 1, fontFamily: "monospace", letterSpacing: "0.04em" }}
                />
                <button
                  type="button"
                  disabled={skuGenerating}
                  onClick={async () => {
                    setSkuGenerating(true);
                    try {
                      const res = await fetch("/api/admin/products/generate-sku", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ type: "product", categoryName: allCategories.find(c => c.id === categoryIds[0])?.name }),
                      });
                      const data = await res.json() as { sku?: string };
                      if (data.sku) setSku(data.sku);
                    } finally {
                      setSkuGenerating(false);
                    }
                  }}
                  style={{
                    padding: "9px 16px",
                    borderRadius: 8,
                    border: "1px solid #e0d5c5",
                    background: skuGenerating ? "#f5f0e8" : "#fff",
                    color: "#6b4c14",
                    fontSize: 13,
                    fontFamily: "'Inter', sans-serif",
                    cursor: skuGenerating ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  {skuGenerating ? "Generating..." : "⚡ Generate"}
                </button>
              </div>
              <p style={{ fontSize: 11, color: "#9a876e", fontFamily: "'Inter', sans-serif", marginTop: 5 }}>
                Unique identifier for this product. Auto-generated or enter your own.
              </p>
            </div>
          </div>

          {/* Section 4: Variants */}
          <div style={sectionCard}>
            <SectionHeading>Variants</SectionHeading>
            <div style={{ marginBottom: 16 }}>
              <Toggle
                checked={hasVariants}
                onChange={(v) => {
                  setHasVariants(v);
                  if (!v) {
                    setOptions([]);
                    setVariants([{ name: "Default", quantity: variants[0]?.quantity ?? 0, optionValues: {}, position: 0 }]);
                  }
                }}
                label="This product has multiple variants (sizes, colors, etc.)"
              />
            </div>

            {!hasVariants ? (
              <div>
                <Label>Quantity in stock</Label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={variants[0]?.quantity ?? 0}
                  onChange={(e) => {
                    const q = parseInt(e.target.value) || 0;
                    setVariants([{ ...variants[0], quantity: q }]);
                  }}
                  style={{ ...inputStyle, maxWidth: 120 }}
                />
              </div>
            ) : (
              <div>
                {/* How variants work — help text */}
                <div style={{ background: "#fdf8ee", border: "1px solid #e8d5a3", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#6b4c14", fontFamily: "'Inter', sans-serif", lineHeight: 1.6 }}>
                  <strong>How variants work:</strong> Each <em>Option</em> is a dimension (e.g. Size, Color, Metal Type). Each <em>Value</em> is a specific choice within that dimension (e.g. Small, Rose Gold, Sterling Silver). Type a value and press <kbd style={{ background: "#fff", border: "1px solid #d4b483", borderRadius: 3, padding: "0 5px", fontSize: 11 }}>Enter</kbd> to add it — phrases with spaces are fully supported. Use <strong>+ Add option</strong> to add a second dimension (e.g. both Size and Color), which will generate all combinations automatically.
                </div>

                {/* Options builder */}
                {options.map((opt, idx) => (
                  <div key={idx} style={{ background: "#faf7f2", borderRadius: 10, padding: "14px 16px", marginBottom: 10, border: "1px solid #ede8df" }}>
                    <div style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 120px" }}>
                        <Label>Option Name</Label>
                        <input
                          type="text"
                          value={opt.name}
                          onChange={(e) => updateOptionName(idx, e.target.value)}
                          placeholder="e.g. Color"
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ flex: "2 1 200px" }}>
                        <Label>Values</Label>
                        <TagInput
                          values={opt.values}
                          onChange={(vals) => {
                            const next = [...options];
                            next[idx] = { ...next[idx], values: vals };
                            setOptions(next);
                          }}
                          placeholder="Type a value, press Enter"
                        />
                        <p style={{ fontSize: 11, color: "#9a876e", margin: "4px 0 0", fontFamily: "'Inter', sans-serif" }}>Phrases with spaces are fine — e.g. "Rose Gold", "Sterling Silver"</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeOption(idx)}
                        style={{ marginTop: 22, padding: "9px 12px", border: "1px solid #fca5a5", borderRadius: 8, background: "#fff", color: "#b91c1c", cursor: "pointer", fontSize: 13, fontFamily: "'Inter', sans-serif" }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addOption}
                  style={{ padding: "9px 16px", border: "1px dashed #c9a84c", borderRadius: 8, background: "transparent", color: "#7a5a00", cursor: "pointer", fontSize: 13, fontFamily: "'Inter', sans-serif", marginBottom: 16 }}
                >
                  + Add option
                </button>

                {/* Variants table */}
                {variants.length > 0 && (
                  <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                    <table style={{ width: "100%", minWidth: 500, borderCollapse: "collapse", fontSize: 13, fontFamily: "'Inter', sans-serif" }}>
                      <thead>
                        <tr style={{ background: "#f5f0e8" }}>
                          {["Variant", "SKU", "Price Override", "Qty"].map((h) => (
                            <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {variants.map((v, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid #ede8df" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 500, color: "#3a2e24" }}>{v.name}</td>
                            <td style={{ padding: "8px 10px" }}>
                              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                <input
                                  type="text"
                                  value={v.sku ?? ""}
                                  onChange={(e) => {
                                    const next = [...variants];
                                    next[idx] = { ...next[idx], sku: e.target.value };
                                    setVariants(next);
                                  }}
                                  placeholder="SKU"
                                  style={{ ...inputStyle, padding: "5px 8px", width: 100 }}
                                />
                                <button
                                  type="button"
                                  title="Generate variant SKU"
                                  onClick={async () => {
                                    if (!sku) return;
                                    try {
                                      const res = await fetch("/api/admin/products/generate-sku", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          type: "variant",
                                          productSku: sku,
                                          optionValues: Object.values(v.optionValues),
                                        }),
                                      });
                                      const data = await res.json() as { sku?: string };
                                      if (data.sku) {
                                        const next = [...variants];
                                        next[idx] = { ...next[idx], sku: data.sku };
                                        setVariants(next);
                                      }
                                    } catch {
                                      // silent
                                    }
                                  }}
                                  style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: "50%",
                                    border: "1px solid #c9a84c",
                                    background: "#fff",
                                    color: "#8B6914",
                                    cursor: sku ? "pointer" : "not-allowed",
                                    fontSize: 12,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                    opacity: sku ? 1 : 0.4,
                                    padding: 0,
                                  }}
                                >
                                  ↻
                                </button>
                              </div>
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={v.price != null ? String(v.price / 100) : ""}
                                onChange={(e) => {
                                  const next = [...variants];
                                  next[idx] = { ...next[idx], price: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null };
                                  setVariants(next);
                                }}
                                placeholder="Use base"
                                style={{ ...inputStyle, padding: "5px 8px", width: 100 }}
                              />
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={v.quantity}
                                onChange={(e) => {
                                  const next = [...variants];
                                  next[idx] = { ...next[idx], quantity: parseInt(e.target.value) || 0 };
                                  setVariants(next);
                                }}
                                style={{ ...inputStyle, padding: "5px 8px", width: 70 }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 7: SEO */}
          <div style={sectionCard}>
            <SectionHeading>SEO</SectionHeading>
            <div style={{ marginBottom: 12, padding: "10px 14px", background: "#faf7f2", borderRadius: 8, border: "1px solid #ede8df" }}>
              <p style={{ fontSize: 12, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>
                URL preview: <span style={{ color: "#3a2e24", fontWeight: 500 }}>/shop/{slug || "your-product-slug"}</span>
              </p>
            </div>
            <div style={fieldGroup}>
              <Label>SEO Title</Label>
              <input type="text" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder={name || "Product title for search engines"} style={inputStyle} />
            </div>
            <div style={fieldGroup}>
              <Label>SEO Description</Label>
              <textarea rows={3} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} placeholder="Brief description for search engines (150–160 characters)" style={textareaStyle} />
              {seoDescription.length > 0 && (
                <p style={{ fontSize: 11, color: seoDescription.length > 160 ? "#b91c1c" : "#9a876e", fontFamily: "'Inter', sans-serif", marginTop: 4 }}>
                  {seoDescription.length}/160
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Right column: sidebar ── */}
        <div>

          {/* Status */}
          <div style={sectionCard}>
            <SectionHeading>Status</SectionHeading>
            {(["DRAFT", "ACTIVE", "ARCHIVED"] as const).map((s) => (
              <label key={s} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="status"
                  value={s}
                  checked={status === s}
                  onChange={() => setStatus(s)}
                  style={{ width: 16, height: 16, accentColor: "#8B6914" }}
                />
                <span style={{ fontSize: 14, fontFamily: "'Inter', sans-serif", color: "#3a2e24", fontWeight: status === s ? 600 : 400 }}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </span>
              </label>
            ))}
          </div>

          {/* Organization */}
          <div style={sectionCard}>
            <SectionHeading>Organization</SectionHeading>
            <div style={fieldGroup}>
              <Label>Categories</Label>
              <div style={{ border: "1px solid #ede8df", borderRadius: 8, overflow: "hidden", maxHeight: 180, overflowY: "auto" }}>
                {allCategories.length === 0 ? (
                  <p style={{ padding: "12px 14px", fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>
                    No categories yet. <a href="/admin/categories" style={{ color: "#8B6914" }}>Add one →</a>
                  </p>
                ) : (
                  allCategories.map((cat) => (
                    <label key={cat.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", cursor: "pointer", borderBottom: "1px solid #f5f0e8" }}>
                      <input
                        type="checkbox"
                        checked={categoryIds.includes(cat.id)}
                        onChange={(e) => {
                          if (e.target.checked) setCategoryIds([...categoryIds, cat.id]);
                          else setCategoryIds(categoryIds.filter((id) => id !== cat.id));
                        }}
                        style={{ width: 15, height: 15, accentColor: "#8B6914" }}
                      />
                      <span style={{ fontSize: 13, fontFamily: "'Inter', sans-serif", color: "#3a2e24" }}>{cat.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div style={fieldGroup}>
              <Label>Tags</Label>
              <TagInput values={tags} onChange={setTags} placeholder="Add tag..." />
            </div>
            <div style={fieldGroup}>
              <Label>Artisan</Label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={artisanId}
                  onChange={e => setArtisanId(e.target.value)}
                  style={{ ...inputStyle, flex: 1, cursor: "pointer" }}
                >
                  <option value="">— None —</option>
                  {artisans.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <a
                  href="/admin/artisans/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flexShrink: 0, padding: "9px 14px", border: "1.5px solid #8B6914", borderRadius: 8, color: "#8B6914", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" }}
                >
                  + New
                </a>
              </div>
              {artisanId && (
                <a
                  href={`/admin/artisans/${artisanId}/edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginTop: 4, display: "inline-block", fontSize: 12, color: "#8B6914", textDecoration: "underline", fontFamily: "'Inter', sans-serif" }}
                >
                  Edit artisan profile ↗
                </a>
              )}
            </div>
            <div style={fieldGroup}>
              <Label>Origin Country</Label>
              <input type="text" value={originCountry} onChange={(e) => setOriginCountry(e.target.value)} placeholder="El Salvador" style={inputStyle} />
            </div>
            <div style={fieldGroup}>
              <Label>Materials Used</Label>
              <TagInput values={materialsUsed} onChange={setMaterialsUsed} placeholder="Add material..." />
            </div>
          </div>

          {/* Shipping */}
          <div style={sectionCard}>
            <SectionHeading>Shipping</SectionHeading>
            <div style={{ marginBottom: 16 }}>
              <Toggle checked={requiresShipping} onChange={setRequiresShipping} label="Requires shipping" />
            </div>
            {requiresShipping && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <Label>Weight</Label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="number" min="0" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.0" style={{ ...inputStyle, flex: 1 }} />
                    <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)} style={{ ...inputStyle, width: 70 }}>
                      <option>oz</option>
                      <option>lb</option>
                      <option>g</option>
                      <option>kg</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label>Dimensions (L × W × H)</Label>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="number" min="0" step="0.1" value={length} onChange={(e) => setLength(e.target.value)} placeholder="L" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                    <span style={{ color: "#c8b89a" }}>×</span>
                    <input type="number" min="0" step="0.1" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="W" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                    <span style={{ color: "#c8b89a" }}>×</span>
                    <input type="number" min="0" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="H" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                    <select value={dimensionUnit} onChange={(e) => setDimensionUnit(e.target.value)} style={{ ...inputStyle, width: 55 }}>
                      <option>in</option>
                      <option>cm</option>
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      {/* ── Sticky save footer ── */}
      <div style={{
        position: "sticky",
        bottom: 0,
        left: 0,
        right: 0,
        background: "#fff",
        borderTop: "1px solid #ede8df",
        padding: "14px 0",
        display: "flex",
        gap: 10,
        justifyContent: "flex-end",
        zIndex: 20,
        marginTop: 8,
      }}>
        <button type="button" onClick={() => save("DRAFT")} disabled={saving} style={btnSecondary}>
          {saving ? "Saving..." : "Save Draft"}
        </button>
        <button type="button" onClick={() => save("ACTIVE")} disabled={saving} style={btnPrimary}>
          {saving ? "Publishing..." : "Publish"}
        </button>
      </div>

      <style>{`
        .product-form-grid { display: grid; grid-template-columns: 1fr 320px; }
        @media (max-width: 860px) {
          .product-form-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
