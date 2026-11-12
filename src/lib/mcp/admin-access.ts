/**
 * mcp/admin-access.ts — who may manage AI assistant access from the store admin.
 * Live lookup (not just the session JWT): the admin must still exist, be active,
 * belong to the session's tenant, and be SUPER_ADMIN or ADMIN to make changes —
 * the same bar as team management.
 */
import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export interface McpAdmin {
  userId: string;
  tenantId: string;
  role: string;
  canManage: boolean;
}

export async function getMcpAdmin(): Promise<McpAdmin | null> {
  const session = await getAdminSession();
  if (!session) return null;
  const user = await prisma.adminUser.findUnique({
    where: { id: session.id },
    select: { id: true, tenantId: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;
  if (session.tenantId && session.tenantId !== user.tenantId) return null;
  return {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    canManage: user.role === "SUPER_ADMIN" || user.role === "ADMIN",
  };
}
