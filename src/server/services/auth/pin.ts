import { getConfig, jsonParseObject, now, one, setConfig } from "@/server/db";
import { AppError } from "@/server/http/api";
import { bytesToHex, hmacSha256, timingSafeEqualString } from "@/server/utils/crypto";
import type { AppEnv, TelegramUser } from "@/server/types/env";

const loginPinKey = "login_pin";
const pinTtlSeconds = 2 * 60;

interface LoginChallenge {
  expiresAt: number;
  pin: string;
}

interface LoginPinRecord {
  expiresAt?: number;
  pinHash?: string;
  user?: TelegramUser;
}

function assertPin(pin: string) {
  if (!/^\d{6}$/.test(pin)) throw new AppError(400, "errors.login_pin_invalid");
}

async function hmacHex(env: AppEnv, value: string) {
  if (!env.APP_SECRET) throw new AppError(500, "errors.app_secret_missing");
  return bytesToHex(await hmacSha256(new TextEncoder().encode(env.APP_SECRET), value));
}

async function pinHash(env: AppEnv, pin: string) {
  return hmacHex(env, `login-pin-hash:${pin}`);
}

async function signChallenge(env: AppEnv, challenge: LoginChallenge) {
  const body = `${challenge.pin}.${challenge.expiresAt}`;
  const signature = (await hmacHex(env, `login-pin-challenge:${body}`)).slice(0, 32);
  return `${body}.${signature}`;
}

async function verifyChallenge(env: AppEnv, pin: string, token: string) {
  assertPin(pin);
  const [tokenPin, expiresRaw, signature] = token.split(".");
  if (!tokenPin || !expiresRaw || !signature || tokenPin !== pin) {
    throw new AppError(401, "errors.login_challenge_invalid");
  }
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now()) {
    throw new AppError(401, "errors.login_challenge_expired");
  }
  const expected = await signChallenge(env, { expiresAt, pin });
  if (!timingSafeEqualString(expected, token)) throw new AppError(401, "errors.login_challenge_invalid");
}

export async function createLoginChallenge(env: AppEnv, pin: string) {
  assertPin(pin);
  const expiresAt = now() + pinTtlSeconds;
  return {
    challenge: await signChallenge(env, { expiresAt, pin }),
    command: `/login ${pin}`,
    expiresAt,
  };
}

export async function confirmLoginPin(env: AppEnv, pin: string, user: TelegramUser) {
  assertPin(pin);
  await setConfig(env, loginPinKey, JSON.stringify({
    expiresAt: now() + pinTtlSeconds,
    pinHash: await pinHash(env, pin),
    user,
  }));
}

export async function consumeLoginPin(env: AppEnv, pin: string, challengeToken: string) {
  await verifyChallenge(env, pin, challengeToken);
  // Compare and delete in one statement so a confirmed PIN issues at most one session.
  const consumed = await one<{ value: string }>(
    env,
    "DELETE FROM configs WHERE key = ? AND json_extract(value, '$.pinHash') = ? AND json_extract(value, '$.expiresAt') >= ? RETURNING value",
    loginPinKey,
    await pinHash(env, pin),
    now(),
  );
  if (consumed) return jsonParseObject<LoginPinRecord>(consumed.value, {}).user ?? null;
  return null;
}

export async function requireInstalledAdmin(env: AppEnv) {
  const adminId = Number(await getConfig(env, "admin_id"));
  if (!adminId) throw new AppError(409, "errors.setup_required");
  return adminId;
}
