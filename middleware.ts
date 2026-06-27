import { NextRequest, NextResponse } from "next/server";

// Header-only middleware: injects the current pathname so server components
// (e.g. the admin protected layout) can build a post-login callbackUrl.
// It does NOT block, redirect, or perform auth — auth stays in the layout.
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/admin/:path*"],
};
