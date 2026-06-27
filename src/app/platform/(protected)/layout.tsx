import { redirect } from "next/navigation";
import { getPlatformSession } from "@/lib/platform-session";
import { PlatformLayoutClient } from "./PlatformLayoutClient";

/**
 * Protected operator shell (P10). Server component: resolves the operator from
 * the `as-platform-session` cookie and redirects to /platform/login when absent.
 * This is the in-app gate; `proxy.ts` additionally enforces JWT validity at the
 * edge (defense in depth), and `requirePlatformOperator` enforces identity in
 * each /api/platform route.
 */
export default async function PlatformProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const operator = await getPlatformSession();
  if (!operator) {
    redirect("/platform/login");
  }

  return (
    <PlatformLayoutClient operator={{ name: operator.name, email: operator.email }}>
      {children}
    </PlatformLayoutClient>
  );
}
