import { getAdminSession } from "@/lib/admin-auth";
import { redirect } from "next/navigation";

export const metadata = { title: "Home Purchase Calculator" };

export default async function CalcPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  return (
    <div style={{ position: "fixed", inset: 0, margin: 0, padding: 0 }}>
      <iframe
        src="/calc-tool.html"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        title="Home Purchase Calculator"
      />
    </div>
  );
}
