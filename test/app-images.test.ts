import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareReviewImage } from "@/app/utils/images";
import { REVIEW_IMAGE_MAX_BYTES } from "@/shared/images";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("payment screenshot preparation", () => {
  it("accepts originals above 2 MB and reduces the result to at most 512 KB", async () => {
    const { canvas, encodings, revoke } = browser({ width: 1800, height: 12000 });
    const result = await prepareReviewImage(new File([new Uint8Array(3_000_000)], "long.png"));

    expect(result.type).toBe("image/jpeg");
    expect(result.size).toBeLessThanOrEqual(REVIEW_IMAGE_MAX_BYTES);
    expect(encodings.length).toBeGreaterThan(1);
    expect(encodings.every(({ width, height }) => width * height <= 4_010_000 && Math.max(width, height) <= 8192)).toBe(true);
    const last = encodings.at(-1)!;
    expect(last.width / last.height).toBeCloseTo(1800 / 12000, 2);
    expect(revoke).toHaveBeenCalledOnce();
    expect(canvas.width * canvas.height).toBe(0);
  });

  it("flattens transparency onto white and accepts exactly 512 KB", async () => {
    const { context } = browser({ width: 800, height: 600, encodedBytes: REVIEW_IMAGE_MAX_BYTES });
    const result = await prepareReviewImage(new File(["png"], "transparent.png", { type: "" }));

    expect(result.size).toBe(REVIEW_IMAGE_MAX_BYTES);
    expect(context.fillStyle).toBe("#fff");
    expect(context.fillRect).toHaveBeenCalledBefore(context.drawImage);
  });

  it("reports unusable images and releases their object URLs", async () => {
    const { revoke } = browser({ width: 0, height: 0, loadFailed: true });
    await expect(prepareReviewImage(new File(["broken"], "broken.png"))).rejects.toThrow();
    expect(revoke).toHaveBeenCalledOnce();
  });

  it("settles a failed canvas conversion instead of leaving processing stuck", async () => {
    const { revoke } = browser({ width: 800, height: 600, encodeFailed: true });
    await expect(prepareReviewImage(new File(["png"], "image.png"))).rejects.toThrow("image_encode_failed");
    expect(revoke).toHaveBeenCalledOnce();
  });
});

function browser(options: { width: number; height: number; encodedBytes?: number; loadFailed?: boolean; encodeFailed?: boolean }) {
  const encodings: Array<{ width: number; height: number; quality: number }> = [];
  const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob(callback: (blob: Blob | null) => void, type: string, quality: number) {
      encodings.push({ width: this.width, height: this.height, quality });
      const size = options.encodedBytes ?? Math.ceil(this.width * this.height * quality);
      callback(options.encodeFailed ? null : new Blob([new Uint8Array(size)], { type }));
    },
  };
  vi.stubGlobal("document", { createElement: () => canvas });
  vi.stubGlobal("Image", class {
    naturalWidth = options.width;
    naturalHeight = options.height;
    async decode() {
      if (options.loadFailed) throw new Error("image_load_failed");
    }
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  return { canvas, context, encodings, revoke };
}
