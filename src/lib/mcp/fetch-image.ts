/**
 * mcp/fetch-image.ts — fetch an https image URL server-side for MCP uploads.
 *
 * MCP clients can't send multipart files, so image tools take a public https
 * URL and we download it here, then hand the bytes to the SAME processing/R2
 * path the admin upload routes use. Guards against SSRF: https only, no
 * credentials in the URL, hostname must resolve only to public addresses,
 * redirects are re-validated hop by hop, 10 MB cap, 15 s timeout.
 */
import { lookup } from "dns/promises";
import { isIP } from "net";

export const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export interface RemoteImage {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}

export type FetchImageResult = { ok: true; image: RemoteImage } | { ok: false; error: string };

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb")) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return isPrivateAddress(mapped[1]);
  return false;
}

export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Not a valid URL");
  }
  if (url.protocol !== "https:") throw new Error("Image URL must use https");
  if (url.username || url.password) throw new Error("Image URL must not contain credentials");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("Image URL host is not public");
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new Error("Image URL host is not public");
  }
  return url;
}

export async function fetchRemoteImage(rawUrl: string): Promise<FetchImageResult> {
  try {
    let url = await assertPublicHttpsUrl(rawUrl);
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = await assertPublicHttpsUrl(new URL(res.headers.get("location") as string, url).toString());
        continue;
      }
      break;
    }
    if (!res || !res.ok) return { ok: false, error: `Image download failed (HTTP ${res?.status ?? "?"})` };
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_REMOTE_IMAGE_BYTES) return { ok: false, error: "File too large. Maximum size is 10MB." };
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_REMOTE_IMAGE_BYTES) return { ok: false, error: "File too large. Maximum size is 10MB." };
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const fileName = decodeURIComponent(url.pathname.split("/").pop() || "image");
    return { ok: true, image: { buffer, contentType, fileName } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Image download failed" };
  }
}
