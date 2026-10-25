import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { imageType, REVIEW_IMAGE_MAX_BYTES } from "@/shared/images";
import { getReview } from "@/server/services/orders/review";
import { submitPaymentReview } from "@/server/services/orders/checkout";
import publicRoutes from "@/server/http/routes/public";
import { getOrder } from "@/server/services/orders/repository";
import { notifyReview } from "@/server/services/telegram/notify";
import type { AppEnv } from "@/server/types/env";

vi.mock("@/server/services/orders/repository", async (original) => ({
  ...await original<typeof import("@/server/services/orders/repository")>(),
  getOrder: vi.fn(),
}));
vi.mock("@/server/services/telegram/notify", () => ({ notifyReview: vi.fn(), notifyPayment: vi.fn() }));
vi.mock("@/server/services/images/banner", () => ({ ensureDefaultBanner: vi.fn() }));

const formats = [
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff, 0xd9] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "image/webp", bytes: [...Buffer.from("RIFF\0\0\0\0WEBP")] },
];

beforeEach(() => {
  vi.mocked(getOrder).mockResolvedValue({ id: "order", status: "pending" } as Awaited<ReturnType<typeof getOrder>>);
});
afterEach(() => vi.clearAllMocks());

describe("review image storage", () => {
  it.each(formats)("reads and restores the actual $type format", async ({ type, bytes }) => {
    const image = new Uint8Array(bytes).buffer;
    const url = `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
    expect(imageType(new Uint8Array(image))).toBe(type);
    const env = reviewEnv(image);
    expect((await getReview(env, "order"))?.image).toBe(url);
  });

  it.each([
    { name: "missing file", file: null },
    { name: "empty file", file: new Blob([]) },
    { name: "mislabeled file", file: new Blob(["not a jpeg"], { type: "image/jpeg" }) },
    { name: "unconverted PNG", file: new Blob([new Uint8Array(formats[1]!.bytes)]) },
  ])("rejects $name before saving or notifying", async ({ file }) => {
    const env = reviewEnv(new ArrayBuffer(0));
    await expect(submitPaymentReview(env, "order", { answer: "answer", image: file })).rejects.toMatchObject({ key: "errors.review_image_invalid", status: 400 });
    expect(env.writes).toHaveLength(0);
    expect(notifyReview).not.toHaveBeenCalled();
  });

  it("accepts a screenshot exactly at the 512 KB limit", async () => {
    const bytes = Buffer.alloc(REVIEW_IMAGE_MAX_BYTES);
    bytes.set(formats[0]!.bytes);
    const env = reviewEnv(bytes.buffer as ArrayBuffer);
    await expect(submitPaymentReview(env, "order", { answer: " answer ", image: new Blob([bytes]) })).resolves.toEqual({ ok: true });
    expect(env.writes).toHaveLength(1);
    expect(env.writes[0]![1]).toBe("answer");
    expect(vi.mocked(notifyReview)).toHaveBeenCalledOnce();
  });

  it.each([REVIEW_IMAGE_MAX_BYTES + 1, REVIEW_IMAGE_MAX_BYTES * 2])("rejects a %i-byte screenshot before writing or notifying", async (size) => {
    const bytes = Buffer.alloc(size);
    bytes.set(formats[0]!.bytes);
    const env = reviewEnv(bytes.buffer as ArrayBuffer);
    await expect(submitPaymentReview(env, "order", { answer: "answer", image: new Blob([bytes]) })).rejects.toMatchObject({ key: "errors.review_image_too_large", status: 400 });
    expect(env.writes).toHaveLength(0);
    expect(vi.mocked(notifyReview)).not.toHaveBeenCalled();
  });

  it("accepts multipart screenshots through the public route", async () => {
    const bytes = new Uint8Array(formats[0]!.bytes);
    const env = reviewEnv(bytes.buffer);
    const body = new FormData();
    body.set("answer", "answer");
    body.set("image", new Blob([bytes], { type: "image/jpeg" }), "payment.jpg");

    const response = await publicRoutes.request("https://hashpay.test/api/checkout/order/review", { method: "POST", body }, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(env.writes).toHaveLength(1);
    expect(new Uint8Array(env.writes[0]![2] as ArrayBuffer)).toEqual(bytes);
  });

  it("rejects a string passed in place of an uploaded file", async () => {
    const env = reviewEnv(new ArrayBuffer(0));
    const body = new FormData();
    body.set("answer", "answer");
    body.set("image", "data:image/jpeg;base64,/9j/2Q==");

    const response = await publicRoutes.request("https://hashpay.test/api/checkout/order/review", { method: "POST", body }, env);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { key: "errors.review_image_invalid" } });
    expect(env.writes).toHaveLength(0);
  });
});

function reviewEnv(image: ArrayBuffer) {
  const writes: unknown[][] = [];
  return {
    writes,
    DB: {
      prepare() {
        let params: unknown[] = [];
        return {
          bind(...values: unknown[]) { params = values; return this; },
          async first() { return { id: 1, answer: "answer", image, image_url: null }; },
          async run() { writes.push(params); return { success: true }; },
        };
      },
    },
  } as unknown as AppEnv & { writes: unknown[][] };
}
