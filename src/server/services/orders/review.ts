import { one, run } from "@/server/db";
import { AppError } from "@/server/http/api";
import { imageType, REVIEW_IMAGE_MAX_BYTES } from "@/shared/images";
import type { AppEnv } from "@/server/types/env";

interface ReviewRow {
  answer: string;
  image: ArrayBuffer | null;
  image_url: string | null;
}

export async function saveReview(env: AppEnv, orderId: string, answer: string, file: Blob | null) {
  if (!file) throw new AppError(400, "errors.review_image_invalid");
  if (file.size > REVIEW_IMAGE_MAX_BYTES) throw new AppError(400, "errors.review_image_too_large");
  const image = await file.arrayBuffer();
  if (imageType(new Uint8Array(image)) !== "image/jpeg") throw new AppError(400, "errors.review_image_invalid");
  // One review per order: a repeat would overwrite the evidence and notify the admin again.
  const saved = await run(env, "INSERT INTO review(order_id, answer, image) VALUES(?, ?, ?) ON CONFLICT(order_id) DO NOTHING", orderId, answer, image);
  if (!saved.meta.changes) throw new AppError(409, "errors.review_submitted");
  return image;
}

export async function getReview(env: AppEnv, orderId: string) {
  const row = await one<ReviewRow>(env, "SELECT answer, image, image_url FROM review WHERE order_id = ?", orderId);
  return row ? {
    answer: row.answer,
    image: row.image ? dataUrl(row.image) : null,
    imageUrl: row.image_url,
  } : null;
}

export async function clearReviewImage(env: AppEnv, orderId: string) {
  await run(env, "UPDATE review SET image = NULL, image_url = NULL WHERE order_id = ?", orderId);
}

function dataUrl(image: ArrayBuffer) {
  const bytes = new Uint8Array(image);
  const type = imageType(bytes);
  if (!type) return null;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}
