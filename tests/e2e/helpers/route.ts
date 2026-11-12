/* eslint-disable @typescript-eslint/no-explicit-any -- tool and route results are arbitrary JSON; tests assert on their shape. */
/**
 * Call an App Router route handler directly with a NextRequest, the way Next
 * would, and return status + parsed JSON.
 */
import { NextRequest } from "next/server";

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;

export interface CallOptions {
  params?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
  formData?: FormData;
  host?: string;
  /** Extra request headers (e.g. cookie). */
  headers?: Record<string, string>;
}

export interface RouteResult<T = any> {
  status: number;
  body: T;
  headers: Headers;
  text: string;
}

export async function call<T = any>(handler: Handler, method: string, path: string, opts: CallOptions = {}): Promise<RouteResult<T>> {
  const url = new URL(path, `https://${opts.host ?? "artisansstories.com"}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const init: RequestInit = { method, headers: { host: url.host, ...(opts.headers ?? {}) } };
  if (opts.formData) init.body = opts.formData;
  else if (opts.body !== undefined) {
    init.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    (init.headers as Record<string, string>)["content-type"] = "application/json";
  }
  const req = new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]);
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON (CSV, redirects)
  }
  return { status: res.status, body: body as T, headers: res.headers, text };
}
