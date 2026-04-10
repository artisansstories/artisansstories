import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LandingPageWrapper from "./LandingPageWrapper";

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let storeEnabled = false;
  try {
    const settings = await prisma.storeSettings.findUnique({
      where: { id: "singleton" },
      select: { storeEnabled: true },
    });
    storeEnabled = settings?.storeEnabled ?? false;
  } catch {
    // DB unavailable — show landing page
  }

  if (storeEnabled) {
    redirect("/shop");
  }

  return <LandingPageWrapper />;
}
