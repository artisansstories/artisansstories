/* eslint-disable @typescript-eslint/no-explicit-any -- JSON payloads from routes/MCP */
/**
 * Catalog e2e — product image upload: POST /api/admin/upload (multipart) and the
 * products_upload_image MCP tool. sharp runs for real; R2 is the in-memory fake.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { F, KEYS, HOUSE, OTHER } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked, type Mcp } from "../helpers/mcp";
import { s3State, fetchState, PNG_1PX, FakeS3Client } from "../helpers/fakes";
import * as uploadRoute from "@/app/api/admin/upload/route";

type H = never;

afterEach(() => {
  vi.restoreAllMocks();
});

async function withMcp<T>(key: string, fn: (mcp: Mcp) => Promise<T>): Promise<T> {
  const mcp = await connectMcp(key);
  try {
    return await fn(mcp);
  } finally {
    await mcp.close();
  }
}

function form(file: Blob | string | null, name = "photo.png", extra: Record<string, string> = {}) {
  const fd = new FormData();
  if (file !== null) {
    if (typeof file === "string") fd.set("file", file);
    else fd.set("file", file, name);
  }
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}
const png = () => new File([new Uint8Array(PNG_1PX)], "photo.png", { type: "image/png" });

/** The three webp variants of one upload, under the tenant prefix. */
function expectWebpVariants(tenantId: string, body: any) {
  expect(s3State.puts).toHaveLength(3);
  const keys = s3State.puts.map((p) => p.Key).sort();
  const base = body.url.replace("https://r2.e2e.test/", "").replace(/\.webp$/, "");
  expect(base).toMatch(new RegExp(`^tenants/${tenantId}/products/\\d+-[a-z0-9]+$`));
  expect(keys).toEqual([`${base}-medium.webp`, `${base}-thumb.webp`, `${base}.webp`].sort());
  for (const p of s3State.puts) {
    expect(p.ContentType).toBe("image/webp");
    expect(p.size).toBeGreaterThan(0);
  }
  expect(body).toMatchObject({
    url: `https://r2.e2e.test/${base}.webp`,
    urlMedium: `https://r2.e2e.test/${base}-medium.webp`,
    urlThumb: `https://r2.e2e.test/${base}-thumb.webp`,
    width: 1,
    height: 1,
    size: PNG_1PX.length,
    altText: null, // no OpenRouter key in the suite
  });
}

describe("POST /api/admin/upload", () => {
  it("401 without a session; nothing stored", async () => {
    const r = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(png()) });
    expect(r.status).toBe(401);
    expect(s3State.puts).toHaveLength(0);
  });

  it("real PNG → three webp variants under the session's tenant prefix", async () => {
    await signInAs(F.admin.super);
    const r = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(png(), "photo.png", { productName: "Hammock" }) });
    expect(r.status, r.text).toBe(200);
    expectWebpVariants(HOUSE, r.body);
  });

  it("another store's admin writes under that store's prefix", async () => {
    await signInAs(F.admin.oSuper);
    const r = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(png()) });
    expect(r.status, r.text).toBe(200);
    expectWebpVariants(OTHER, r.body);
  });

  it("wrong type, missing file, oversize and undecodable images are 400; nothing stored", async () => {
    await signInAs(F.admin.super);
    const wrongType = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(new File(["hello"], "notes.txt", { type: "text/plain" }), "notes.txt") });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error).toMatch(/Invalid file type/);
    const gif = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(new File([new Uint8Array(PNG_1PX)], "a.gif", { type: "image/gif" }), "a.gif") });
    expect(gif.status).toBe(400);
    const none = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(null) });
    expect(none.status).toBe(400);
    expect(none.body).toEqual({ error: "No file provided" });
    const str = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form("just a string") });
    expect(str.status).toBe(400);
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    const tooBig = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(big, "big.png") });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error).toMatch(/too large/);
    const garbage = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(new File(["definitely not a png"], "x.png", { type: "image/png" }), "x.png") });
    expect(garbage.status, garbage.text).toBe(400);
    expect(s3State.puts).toHaveLength(0);
  });

  it("a failed R2 write is reported as an error, not a success with dead URLs", async () => {
    await signInAs(F.admin.super);
    vi.spyOn(FakeS3Client.prototype, "send").mockRejectedValueOnce(new Error("R2 is down"));
    const r = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(png()) });
    expect(r.status, r.text).toBeGreaterThanOrEqual(500);
    expect(r.body.error).toEqual(expect.any(String));
    expect(r.body.url).toBeUndefined();
  });
});

describe("MCP products_upload_image", () => {
  it("preview fetches/stores nothing; confirm stores webp variants under the key's tenant; replay blocked", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const args = { imageUrl: "https://images.example.test/hammock.png", productName: "Hammock" };
      const flow = await previewConfirmReplay(mcp, "products_upload_image", args, (preview) => {
        expect(s3State.puts).toHaveLength(0);
        expect(fetchState.served).toHaveLength(0);
        expect(preview.preview).toMatchObject({ imageUrl: args.imageUrl, attachesToProduct: false });
      });
      const result = expectConfirmed(flow);
      expectReplayBlocked(flow);
      expect(fetchState.served).toEqual([args.imageUrl]);
      expectWebpVariants(HOUSE, result);
    });
  });

  it("another store's key writes under that store's prefix", async () => {
    await withMcp(KEYS.otherAdmin, async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "products_upload_image", { imageUrl: "https://images.example.test/glove.png" });
      expectWebpVariants(OTHER, expectConfirmed(flow));
    });
  });

  it("private hosts and non-https URLs are refused before any fetch", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const priv = await mcp.call("products_upload_image", { imageUrl: "https://private.example.test/x.png" });
      expect(priv).toMatchObject({ done: false, blocked: true, status: 400 });
      expect(priv.reason).toMatch(/not public/);
      const http = await mcp.call("products_upload_image", { imageUrl: "http://images.example.test/x.png" });
      expect(http).toMatchObject({ blocked: true, status: 400 });
      const local = await mcp.call("products_upload_image", { imageUrl: "https://127.0.0.1/x.png" });
      expect(local).toMatchObject({ blocked: true, status: 400 });
      expect(fetchState.served).toHaveLength(0);
      expect(fetchState.blocked).toHaveLength(0);
      expect(s3State.puts).toHaveLength(0);
    });
  });

  it("a 404 image is reported as a failure and stores nothing", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "products_upload_image", { imageUrl: "https://images.example.test/missing.png" });
      expect(flow.confirmed).toMatchObject({ done: false, blocked: true, status: 400, outcome: "failed" });
      expect(flow.confirmed.reason).toMatch(/404/);
      expectReplayBlocked(flow);
      expect(s3State.puts).toHaveLength(0);
    });
  });

  it("a failed R2 write is reported as a failure", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      vi.spyOn(FakeS3Client.prototype, "send").mockRejectedValueOnce(new Error("R2 is down"));
      const flow = await previewConfirmReplay(mcp, "products_upload_image", { imageUrl: "https://images.example.test/a.png" });
      expect(flow.confirmed.done, JSON.stringify(flow.confirmed)).toBe(false);
      expect(flow.confirmed.blocked).toBe(true);
      expect(flow.confirmed.status).toBeGreaterThanOrEqual(500);
    });
  });

  it("is not available to a read-only key", async () => {
    await withMcp(KEYS.houseRead, async (mcp) => {
      expect(await mcp.toolNames()).not.toContain("products_upload_image");
    });
  });
});
