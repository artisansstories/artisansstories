import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { exportOrdersCsv, listOrders, type OrderListParams } from "@/lib/admin-services/orders";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";
export async function GET(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    const searchParams = request.nextUrl.searchParams;
    const params: OrderListParams = {
      status: searchParams.get("status") ?? "",
      financialStatus: searchParams.get("financialStatus") ?? "",
      search: searchParams.get("search") ?? "",
      startDate: searchParams.get("startDate") ?? "",
      endDate: searchParams.get("endDate") ?? "",
      page: parseInt(searchParams.get("page") ?? "1", 10),
      limit: parseInt(searchParams.get("limit") ?? "20", 10),
    };
    if (searchParams.get("export") === "csv") {
      const csvContent = await exportOrdersCsv(db, params);
      return new Response(csvContent, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="orders.csv"',
        },
      });
    }
    return toResponse(await listOrders(db, params));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/orders error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
