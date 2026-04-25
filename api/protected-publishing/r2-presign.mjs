const encoder = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function encodeRfc3986(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeObjectKey(key) {
  return String(key || "")
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    typeof secret === "string" ? encoder.encode(secret) : secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function hmac(secret, value) {
  const key = await importHmacKey(secret);
  return crypto.subtle.sign("HMAC", key, typeof value === "string" ? encoder.encode(value) : value);
}

async function deriveSigningKey(secretKey, dateStamp, region, service) {
  const kDate = await hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function formatAmzDate(date) {
  const iso = new Date(date).toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

export async function createR2PresignedUploadUrl({
  accountId,
  bucket,
  objectKey,
  accessKeyId,
  secretAccessKey,
  expiresInSeconds = 3600,
  now = new Date(),
}) {
  const normalizedAccountId = String(accountId || "").trim();
  const normalizedBucket = String(bucket || "").trim();
  const normalizedObjectKey = String(objectKey || "").trim().replace(/^\/+/, "");
  const normalizedAccessKeyId = String(accessKeyId || "").trim();
  const normalizedSecretAccessKey = String(secretAccessKey || "").trim();

  if (!normalizedAccountId || !normalizedBucket || !normalizedObjectKey || !normalizedAccessKeyId || !normalizedSecretAccessKey) {
    throw new Error("R2 presign is not configured");
  }

  const host = `${normalizedAccountId}.r2.cloudflarestorage.com`;
  const method = "PUT";
  const service = "s3";
  const region = "auto";
  const { amzDate, dateStamp } = formatAmzDate(now);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = `/${encodeRfc3986(normalizedBucket)}/${encodeObjectKey(normalizedObjectKey)}`;

  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${normalizedAccessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.max(1, Math.min(Number(expiresInSeconds) || 3600, 604800))),
    "X-Amz-SignedHeaders": "host",
  });

  const sortedQuery = [...queryParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) return leftValue.localeCompare(rightValue);
      return leftKey.localeCompare(rightKey);
    })
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    method,
    canonicalUri,
    sortedQuery,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(normalizedSecretAccessKey, dateStamp, region, service);
  const signature = toHex(await hmac(signingKey, stringToSign));
  queryParams.set("X-Amz-Signature", signature);

  return {
    method,
    url: `https://${host}${canonicalUri}?${queryParams.toString()}`,
    headers: {},
  };
}
