import { NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { checkShippedTracking } from "@/lib/admin-services/orders";
import { toResponse } from "@/lib/admin-services/http";

/**
 * POST /api/admin/orders/check-tracking
 * Checks all SHIPPED orders against USPS/UPS APIs.
 * Flips status to DELIVERED when carrier confirms delivery.
 * Returns a summary of what was checked and what changed.
 */
export async function POST() {
  try {
    const db = await getTenantPrismaForAdmin();
    return toResponse(await checkShippedTracking(db));
  } catch (error) {
    console.error("check-tracking error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
