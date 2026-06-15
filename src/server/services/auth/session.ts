import { jwtVerify, SignJWT } from "jose";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { AppError } from "@/server/http/api-error";
import { getConfig } from "@/server/db";
import type { AppEnv, AppVariables, TelegramUser } from "@/shared/types/env";

const encoder = new TextEncoder();
const adminCookieName = "hashpay_session";
const setupCookieName = "hashpay_setup";

function secret(env: AppEnv) {
  if (!env.APP_SECRET) throw new AppError(500, "app_secret_missing", "APP_SECRET is not configured");
  return encoder.encode(env.APP_SECRET);
}

export async function signToken(env: AppEnv, user: TelegramUser, expiresIn: string) {
  return new SignJWT({
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret(env));
}

export function signSession(env: AppEnv, user: TelegramUser) {
  return signToken(env, user, "7d");
}

function setJwtCookie(c: Context, name: string, token: string, maxAge: number) {
  setCookie(c, name, token, {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
  });
}

export function setSessionCookie(c: Context, token: string) {
  setJwtCookie(c, adminCookieName, token, 7 * 86400);
}

export function setSetupCookie(c: Context, token: string) {
  setJwtCookie(c, setupCookieName, token, 10 * 60);
}

export function setupCookie(c: Context) {
  return getCookie(c, setupCookieName);
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, adminCookieName, { path: "/" });
  deleteCookie(c, setupCookieName, { path: "/" });
}

export async function verifySession(env: AppEnv, token: string): Promise<TelegramUser> {
  const result = await jwtVerify(token, secret(env));
  const id = Number(result.payload.sub);
  if (!Number.isFinite(id)) throw new AppError(401, "session_invalid", "Session is invalid");
  return {
    firstName: typeof result.payload.firstName === "string" ? result.payload.firstName : undefined,
    id,
    lastName: typeof result.payload.lastName === "string" ? result.payload.lastName : undefined,
    username: typeof result.payload.username === "string" ? result.payload.username : undefined,
  };
}

export async function requireAdmin(c: Context<{ Bindings: AppEnv; Variables: AppVariables }>) {
  const token = getCookie(c, adminCookieName);
  if (!token) throw new AppError(401, "session_missing", "Please sign in");
  const user = await verifySession(c.env, token);
  const adminId = Number(await getConfig(c.env, "admin_id"));
  if (!adminId || user.id !== adminId) throw new AppError(403, "admin_forbidden", "Forbidden");
  c.set("tgUser", user);
  return user;
}
