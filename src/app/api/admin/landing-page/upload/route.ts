import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdminSession } from "@/lib/admin-auth";
import { putObject, publicUrl } from "@/lib/r2";

export async function POST(req: Request) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const field = formData.get("field") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop();
    const key = `landing-page/${field}-${randomUUID()}.${ext}`;

    await putObject(key, buffer, file.type);

    return NextResponse.json({ url: publicUrl(key) });
  } catch (error) {
    console.error("R2 upload failed:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
