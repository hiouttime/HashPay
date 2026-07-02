const encoder = new TextEncoder();
const base62Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64ToArrayBuffer(value: string) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function arrayBufferToBase64(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/(.{64})/g, "$1\n").trim();
}

function pemBlock(label: string, value: ArrayBuffer) {
  return `-----BEGIN ${label}-----\n${arrayBufferToBase64(value)}\n-----END ${label}-----`;
}

function normalizePublicKeyPem(value: string) {
  return value.trim().replace(/\r\n/g, "\n");
}

export async function generateRsaKeyPair() {
  const pair = await crypto.subtle.generateKey(
    { hash: "SHA-256", modulusLength: 2048, name: "RSASSA-PKCS1-v1_5", publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["sign", "verify"],
  );
  const [privateKey, publicKey] = await Promise.all([
    crypto.subtle.exportKey("pkcs8", pair.privateKey),
    crypto.subtle.exportKey("spki", pair.publicKey),
  ]);
  return {
    privateKeyPem: pemBlock("PRIVATE KEY", privateKey),
    publicKeyPem: pemBlock("PUBLIC KEY", publicKey),
  };
}

async function importRsaPublicKey(publicKeyPem: string) {
  const normalized = normalizePublicKeyPem(publicKeyPem);
  const body = normalized
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "");
  if (!normalized.includes("-----BEGIN PUBLIC KEY-----") || !normalized.includes("-----END PUBLIC KEY-----")) {
    throw new Error("RSA public key must be SPKI PEM");
  }
  return crypto.subtle.importKey(
    "spki",
    base64ToArrayBuffer(body),
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["verify"],
  );
}

export async function verifyRsaSha256(publicKeyPem: string, signatureBase64: string, payload: string) {
  const publicKey = await importRsaPublicKey(publicKeyPem);
  return crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    publicKey,
    base64ToArrayBuffer(signatureBase64),
    encoder.encode(payload),
  );
}

export function timingSafeEqualString(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function randomBase62(length: number) {
  let value = "";
  const max = Math.floor(256 / base62Alphabet.length) * base62Alphabet.length;
  while (value.length < length) {
    const data = new Uint8Array(length - value.length);
    crypto.getRandomValues(data);
    for (const byte of data) {
      if (byte >= max) continue;
      value += base62Alphabet[byte % base62Alphabet.length];
      if (value.length === length) break;
    }
  }
  return value;
}

export function createOrderId() {
  return randomBase62(18);
}
