import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
export async function POST(request: NextRequest) {
  try {
    
    
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const blob = file as Blob;
    const contentType = blob.type;
    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, and WebP are allowed." },
        { status: 400 }
      );
    }
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }
    // Process images with sharp
    const sharpInstance = sharp(buffer);
    const metadata = await sharpInstance.metadata();
    const [fullBuffer, mediumBuffer, thumbBuffer] = await Promise.all([
      sharp(buffer).resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
      sharp(buffer).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
      sharp(buffer).resize({ width: 300, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    ]);
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const baseName = `products/${timestamp}-${random}`;
    const fullKey = `${baseName}.webp`;
    const mediumKey = `${baseName}-medium.webp`;
    const thumbKey = `${baseName}-thumb.webp`;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
    const accountId = process.env.R2_ACCOUNT_ID ?? "";
    const bucketName = process.env.R2_BUCKET_NAME ?? "";
    const publicUrl = process.env.R2_PUBLIC_URL ?? "";
    // If credentials are missing, return mock URLs for development
    if (!accessKeyId || !secretAccessKey) {
      console.warn("R2 credentials not configured — returning mock URLs");
      return NextResponse.json({
        url: `${publicUrl}/${fullKey}`,
        urlThumb: `${publicUrl}/${thumbKey}`,
        urlMedium: `${publicUrl}/${mediumKey}`,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        size: buffer.byteLength,
      });
    }
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    await Promise.all([
      s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: fullKey,
        Body: fullBuffer,
        ContentType: "image/webp",
      })),
      s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: mediumKey,
        Body: mediumBuffer,
        ContentType: "image/webp",
      })),
      s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: thumbKey,
        Body: thumbBuffer,
        ContentType: "image/webp",
      })),
    ]);
    return NextResponse.json({
      url: `${publicUrl}/${fullKey}`,
      urlThumb: `${publicUrl}/${thumbKey}`,
      urlMedium: `${publicUrl}/${mediumKey}`,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      size: buffer.byteLength,
    });
  } catch (err) {
    console.error("POST /api/admin/upload error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
