import { REVIEW_IMAGE_MAX_BYTES } from "@/shared/images";

export async function prepareReviewImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement("canvas");
  try {
    image.src = url;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    const scale = Math.min(1, 8192 / Math.max(width, height), Math.sqrt(4_000_000 / (width * height)));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d")!;

    while (true) {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let size = 0;
      for (const quality of [0.9, 0.8, 0.65, 0.5, 0.35]) {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("image_encode_failed")), "image/jpeg", quality);
        });
        size = blob.size;
        if (size <= REVIEW_IMAGE_MAX_BYTES) return blob;
      }
      const shrink = Math.min(0.8, Math.sqrt(REVIEW_IMAGE_MAX_BYTES / size) * 0.9);
      canvas.width = Math.max(1, Math.floor(canvas.width * shrink));
      canvas.height = Math.max(1, Math.floor(canvas.height * shrink));
    }
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}
