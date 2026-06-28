import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";

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

/**
 * List every object key under a prefix, following ListObjectsV2 pagination
 * (1000 keys/page) via the continuation token until the bucket is exhausted.
 *
 * No-ops gracefully (returns `[]`) when R2 is not configured, so callers in
 * environments without bucket credentials (CI, local) don't throw.
 */
export async function listObjectsByPrefix(prefix: string): Promise<string[]> {
  if (!isR2Configured()) return [];
  const bucket = env().bucketName;
  const keys: string[] = [];
  let continuationToken: string | undefined = undefined;
  do {
    const out: ListObjectsV2CommandOutput = await client().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of out.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

/**
 * Delete every object under a prefix and return the number removed. Lists first
 * (paginated), then issues DeleteObjects in batches of ≤1000 (the S3/R2 cap).
 *
 * No-ops gracefully (returns 0) when R2 is not configured. Used by the tenant
 * hard-delete to sweep `tenants/{id}/…`; the caller treats failure as
 * best-effort and never fails the delete on an R2 error.
 */
export async function deleteObjectsByPrefix(prefix: string): Promise<number> {
  if (!isR2Configured()) return 0;
  const bucket = env().bucketName;
  const keys = await listObjectsByPrefix(prefix);
  if (keys.length === 0) return 0;

  let deleted = 0;
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    const out = await client().send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      })
    );
    deleted += batch.length - (out.Errors?.length ?? 0);
  }
  return deleted;
}
