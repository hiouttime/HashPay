import { deleteConfig, getConfig, jsonParseObject, now, setConfig } from "@/server/db";
import { AppError } from "@/server/http/api-error";
import { timingSafeEqualString } from "@/server/services/crypto";
import type { AppEnv, TelegramUser } from "@/shared/types/env";

const encoder = new TextEncoder();
const loginPinKey = "login_pin";
const pinTtlSeconds = 2 * 60;

interface LoginChallenge {
  expiresAt: number;
  issuedAt: number;
  pin: string;
}

interface LoginPinRecord {
  confirmedAt?: number;
  expiresAt?: number;
  pinHash?: string;
  user?: TelegramUser;
}

function assertPin(pin: string) {
  if (!/^\d{6}$/.test(pin)) throw new AppError(400, "login_pin_invalid", "登录 PIN 必须是 6 位数字");
}

async function hmacHex(env: AppEnv, value: string) {
  if (!env.APP_SECRET) throw new AppError(500, "app_secret_missing", "APP_SECRET is not configured");
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.APP_SECRET), { hash: "SHA-256", name: "HMAC" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function pinHash(env: AppEnv, pin: string) {
  return hmacHex(env, `login-pin-hash:${pin}`);
}

async function signChallenge(env: AppEnv, challenge: LoginChallenge) {
  const body = `${challenge.pin}.${challenge.issuedAt}.${challenge.expiresAt}`;
  const signature = (await hmacHex(env, `login-pin-challenge:${body}`)).slice(0, 32);
  return `${body}.${signature}`;
}

async function verifyChallenge(env: AppEnv, pin: string, token: string) {
  assertPin(pin);
  const [tokenPin, issuedRaw, expiresRaw, signature] = token.split(".");
  if (!tokenPin || !issuedRaw || !expiresRaw || !signature || tokenPin !== pin) {
    throw new AppError(401, "login_challenge_invalid", "登录请求无效");
  }
  const issuedAt = Number(issuedRaw);
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt < now()) {
    throw new AppError(401, "login_challenge_expired", "登录 PIN 已过期");
  }
  const expected = await signChallenge(env, { expiresAt, issuedAt, pin });
  if (!timingSafeEqualString(expected, token)) throw new AppError(401, "login_challenge_invalid", "登录请求无效");
  return { expiresAt, issuedAt, pin };
}

export async function createLoginChallenge(env: AppEnv, pin: string) {
  assertPin(pin);
  const issuedAt = now();
  const expiresAt = issuedAt + pinTtlSeconds;
  return {
    challenge: await signChallenge(env, { expiresAt, issuedAt, pin }),
    command: `/login ${pin}`,
    expiresAt,
  };
}

export async function confirmLoginPin(env: AppEnv, pin: string, user: TelegramUser) {
  assertPin(pin);
  const confirmedAt = now();
  await setConfig(env, loginPinKey, JSON.stringify({
    confirmedAt,
    expiresAt: confirmedAt + pinTtlSeconds,
    pinHash: await pinHash(env, pin),
    user,
  }));
}

export async function consumeLoginPin(env: AppEnv, pin: string, challengeToken: string) {
  const challenge = await verifyChallenge(env, pin, challengeToken);
  const record = jsonParseObject<LoginPinRecord>(await getConfig(env, loginPinKey), {});
  if (!record.pinHash || !record.confirmedAt || !record.expiresAt || !record.user?.id) return null;
  if (record.expiresAt < now()) return null;
  if (!timingSafeEqualString(record.pinHash, await pinHash(env, pin))) return null;
  if (record.confirmedAt < challenge.issuedAt || record.confirmedAt > challenge.expiresAt) return null;
  await deleteConfig(env, loginPinKey);
  return record.user;
}

export async function requireInstalledAdmin(env: AppEnv) {
  const adminId = Number(await getConfig(env, "admin_id"));
  if (!adminId) throw new AppError(409, "setup_required", "HashPay 尚未完成初始化");
  return adminId;
}
