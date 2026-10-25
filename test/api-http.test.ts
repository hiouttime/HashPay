import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, post, request, setApiMessage, upload } from "@/app/api";
import { setLocale } from "@/app/i18n";

describe("frontend api http client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setApiMessage(null);
    setLocale("zh-CN");
  });

  it("returns json responses directly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));

    await expect(request("/api/example")).resolves.toEqual({ ok: true });
  });

  it("throws ApiError and displays server error messages", async () => {
    const message = { error: vi.fn() };
    setApiMessage(message);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: { key: "errors.bad_request" } }, 400));

    await expect(request("/api/example")).rejects.toMatchObject({
      key: "errors.bad_request",
      message: "请求无效",
      status: 400,
    });
    expect(message.error).toHaveBeenCalledWith("请求无效");
  });

  it("uses a stable fallback for non-json errors", async () => {
    const message = { error: vi.fn() };
    setApiMessage(message);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 503 }));

    await expect(request("/api/example")).rejects.toMatchObject({ message: "HTTP 503" });
    expect(message.error).toHaveBeenCalledWith("HTTP 503");
  });

  it("does not display silent errors", async () => {
    const message = { error: vi.fn() };
    setApiMessage(message);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: { key: "errors.payment_check_failed" } }, 500));

    await expect(request("/api/example", { silent: true })).rejects.toMatchObject({ key: "errors.payment_check_failed" });
    expect(message.error).not.toHaveBeenCalled();
  });

  it("sends json bodies with credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));

    await post("/api/example", { name: "HashPay" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.credentials).toBe("include");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({ name: "HashPay" }));
  });

  it("posts dashboard rechecks", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      actions: [],
      health: [],
      orders: [],
      pending: 0,
      trends: { "15d": [], "30d": [], "7d": [], td: [], yd: [] },
    }));

    await api.dashboard.check();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/dashboard/check");
    expect(init?.method).toBe("POST");
  });

  it("uploads binary bodies with explicit content type", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ url: "/banner.webp" }));
    const body = new ArrayBuffer(8);

    await upload("/api/banner", body, "image/webp");

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.credentials).toBe("include");
    expect(init?.method).toBe("PUT");
    expect(new Headers(init?.headers).get("content-type")).toBe("image/webp");
    expect(init?.body).toBe(body);
  });

  it("submits a screenshot as multipart data with a browser-generated boundary", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));
    const image = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });

    await expect(api.checkout.review("order", { answer: "answer", image })).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/checkout/order/review");
    expect(new Headers(init?.headers).has("content-type")).toBe(false);
    const body = init?.body as FormData;
    expect(body.get("answer")).toBe("answer");
    expect(body.get("image")).toMatchObject({ type: "image/jpeg", size: 3, name: "payment.jpg" });
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}
