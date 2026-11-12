import { NextResponse } from "next/server";
import type { ServiceResult } from "./result";

/** Map a ServiceResult back onto the exact response the route used to send. */
export function toResponse<T>(r: ServiceResult<T>): NextResponse {
  if (r.ok) return NextResponse.json(r.data, r.status ? { status: r.status } : undefined);
  return NextResponse.json(r.body, { status: r.status });
}
