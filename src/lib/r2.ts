import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * Shared Cloudflare R2 (S3-compatible) client + helpers.
 *
 * Centralizes the client that was previously copy-pasted inline across the four
 * upload routes (admin/upload, landing-page/upload, email-template/upload-logo,
 * email-template/upload-avatar). All config comes from `process.env` only —
 * no secrets in source. Standardized env names:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME, R2_PUBLIC_URL.
 */

function env() {
  return {
    accountId: process.env.R2_ACCOUNT_ID ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucketName: process.env.R2_BUCKET_NAME ?? "",
    publicUrl: process.env.R2_PUBLIC_URL ?? "",
  };
}

/** True when access key + secret are present (R2 writes are possible). */
export function isR2Configured(): boolean {
  const { accessKeyId, secretAccessKey } = env();
  return Boolean(accessKeyId && secretAccessKey);
}

/** Public URL for a stored object key. */
export function publicUrl(key: string): string {
  return `${env().publicUrl}/${key}`;
}

let _client: S3Client | null = null;

function client(): S3Client {
  if (_client) return _client;
  const { accountId, accessKeyId, secretAccessKey } = env();
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  return _client;
}

/** Upload an object to the configured R2 bucket. */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: env().bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}
