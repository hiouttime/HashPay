import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, post, request, setApiMessage, upload } from "@/app/api";

describe("frontend api http client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setApiMessage(null);
  });

  it("returns data from api envelopes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ data: { ok: true } }));

    await expect(request("/api/example")).resolves.toEqual({ ok: true });
  });

  it("throws ApiError and displays server error messages", async () => {
    const message = { error: vi.fn() };
    setApiMessage(message);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      error: { code: "bad_request", message: "请求无效" },
    }, 400));

    await expect(request("/api/example")).rejects.toMatchObject({
      code: "bad_request",
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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      error: { code: "poll_failed", message: "轮询失败" },
    }, 500));

    await expect(request("/api/example", { silent: true })).rejects.toMatchObject({ code: "poll_failed" });
    expect(message.error).not.toHaveBeenCalled();
  });

  it("sends json bodies with credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ data: { ok: true } }));

    await post("/api/example", { name: "HashPay" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.credentials).toBe("include");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({ name: "HashPay" }));
  });

  it("uploads binary bodies with explicit content type", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ data: { url: "/banner.webp" } }));
    const body = new ArrayBuffer(8);

    await upload("/api/banner", body, "image/webp");

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.credentials).toBe("include");
    expect(init?.method).toBe("PUT");
    expect(new Headers(init?.headers).get("content-type")).toBe("image/webp");
    expect(init?.body).toBe(body);
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}
