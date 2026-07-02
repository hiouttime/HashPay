export interface CopyMessage {
  success(text: string): unknown;
  warning(text: string): unknown;
}

export async function copyText(value: unknown, options: { message?: CopyMessage } = {}) {
  const text = String(value ?? "");
  if (!text || typeof window === "undefined" || typeof navigator === "undefined" || !window.isSecureContext || !navigator.clipboard?.writeText) {
    options.message?.warning("复制失败，请手动复制");
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    options.message?.success("已复制");
    return true;
  } catch {
    options.message?.warning("复制失败，请手动复制");
    return false;
  }
}
