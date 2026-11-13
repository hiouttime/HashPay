import { AppError } from "@/server/http/api";
import type { AppEnv } from "@/server/types/env";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const base62Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const callbackEnvelopeAlgorithm = "RSA-OAEP-256+A256GCM" as const;
const encryptedPrefix = "enc:v1:";

export interface CallbackEnvelope {
  alg: typeof callbackEnvelopeAlgorithm;
  data: string;
  iv: string;
  key: string;
}

export function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacSha256(key: BufferSource, value: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { hash: "SHA-256", name: "HMAC" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
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

export async function verifyRsaSha256(publicKeyPem: string, signatureBase64: string, payload: string) {
  const publicKey = await crypto.subtle.importKey(
    "spki",
    pemBody(publicKeyPem, "PUBLIC KEY"),
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    publicKey,
    unbase64Bytes(signatureBase64),
    encoder.encode(payload),
  );
}

export async function encryptCallbackEnvelope(publicKeyPem: string, payload: string): Promise<CallbackEnvelope> {
  const publicKey = await importRsaOaepKey("spki", publicKeyPem, "PUBLIC KEY", ["encrypt"]);
  const contentKey = await crypto.subtle.generateKey({ length: 256, name: "AES-GCM" }, true, ["encrypt"]);
  const rawContentKey = await crypto.subtle.exportKey("raw", contentKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const [encryptedKey, encryptedData] = await Promise.all([
    crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawContentKey),
    crypto.subtle.encrypt({ iv, name: "AES-GCM" }, contentKey, encoder.encode(payload)),
  ]);
  return {
    alg: callbackEnvelopeAlgorithm,
    data: base64Bytes(new Uint8Array(encryptedData)),
    iv: base64Bytes(iv),
    key: base64Bytes(new Uint8Array(encryptedKey)),
  };
}

export async function decryptCallbackEnvelope(privateKeyPem: string, encrypted: CallbackEnvelope) {
  if (encrypted.alg !== callbackEnvelopeAlgorithm) throw new Error("Unsupported callback encryption algorithm");
  const privateKey = await importRsaOaepKey("pkcs8", privateKeyPem, "PRIVATE KEY", ["decrypt"]);
  const rawContentKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, unbase64Bytes(encrypted.key));
  const contentKey = await crypto.subtle.importKey("raw", rawContentKey, "AES-GCM", false, ["decrypt"]);
  const payload = await crypto.subtle.decrypt(
    { iv: unbase64Bytes(encrypted.iv), name: "AES-GCM" },
    contentKey,
    unbase64Bytes(encrypted.data),
  );
  return decoder.decode(payload);
}

function importRsaOaepKey(format: "pkcs8" | "spki", pem: string, label: "PRIVATE KEY" | "PUBLIC KEY", usage: KeyUsage[]) {
  return crypto.subtle.importKey(
    format,
    pemBody(pem, label),
    { hash: "SHA-256", name: "RSA-OAEP" },
    false,
    usage,
  );
}

function pemBody(pem: string, label: string) {
  const normalized = pem.trim().replace(/\r\n/g, "\n");
  const begin = `-----BEGIN ${label}-----`;
  const end = `-----END ${label}-----`;
  if (!normalized.includes(begin) || !normalized.includes(end)) throw new Error(`RSA key must be ${label} PEM`);
  return unbase64Bytes(normalized.replace(begin, "").replace(end, ""));
}

export function timingSafeEqualString(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function encryptSecret(env: AppEnv, value: string) {
  if (!value || value === "{}") return value;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ iv, name: "AES-GCM" }, await secretKey(env), encoder.encode(value));
  return `${encryptedPrefix}${base64Bytes(iv)}:${base64Bytes(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(env: AppEnv, value: string) {
  if (!value || value === "{}") return value;
  if (!value.startsWith(encryptedPrefix)) throw new AppError(500, "errors.payment_credential_invalid");
  const [ivRaw, dataRaw] = value.slice(encryptedPrefix.length).split(":");
  if (!ivRaw || !dataRaw) throw new AppError(500, "errors.payment_credential_invalid");
  try {
    const plaintext = await crypto.subtle.decrypt(
      { iv: unbase64Bytes(ivRaw), name: "AES-GCM" },
      await secretKey(env),
      unbase64Bytes(dataRaw),
    );
    return decoder.decode(plaintext);
  } catch {
    throw new AppError(500, "errors.payment_credential_invalid");
  }
}

// Every channel listing decrypts each channel's credentials, so derive the key once per isolate.
const credentialKeys = new Map<string, Promise<CryptoKey>>();

function secretKey(env: AppEnv) {
  const secret = env.APP_SECRET;
  if (!secret) throw new AppError(500, "errors.app_secret_missing");
  const cached = credentialKeys.get(secret);
  if (cached) return cached;
  const key = crypto.subtle.digest("SHA-256", encoder.encode(`HashPay credential box:${secret}`))
    .then((material) => crypto.subtle.importKey("raw", material, "AES-GCM", false, ["decrypt", "encrypt"]));
  credentialKeys.set(secret, key);
  return key;
}

function base64Bytes(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function unbase64Bytes(value: string) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function randomBase62(length: number) {
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
