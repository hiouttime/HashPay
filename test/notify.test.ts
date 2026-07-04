import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverNotify } from "@/server/services/orders/notifications";
import type { AppEnv } from "@/server/types/env";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("notify", () => {
  it("records HTTP failures for cron-driven retry without throwing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 503 }));
    const state = notifyEnv({
      attempts: 2,
      callback: "https://merchant.test/callback",
      payload_json: "{\"ok\":true}",
      status: "pending",
    });

    await expect(deliverNotify(state.env, 9)).resolves.toBeUndefined();

    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]?.params).toEqual(["retry", 3, 1_980, "HTTP 503", 1_800, 9]);
  });

  it("marks the final retry as failed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const state = notifyEnv({
      attempts: 7,
      callback: "https://merchant.test/callback",
      payload_json: "{\"ok\":true}",
      status: "retry",
    });

    await expect(deliverNotify(state.env, 10)).resolves.toBeUndefined();

    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]?.params).toEqual(["failed", 8, 2_480, "network down", 2_000, 10]);
  });

  it("ignores already failed notifications", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const state = notifyEnv({
      attempts: 8,
      callback: "https://merchant.test/callback",
      payload_json: "{}",
      status: "failed",
    });

    await deliverNotify(state.env, 11);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.runs).toEqual([]);
  });
});

function notifyEnv(row: { attempts: number; callback: string | null; payload_json: string; status: string }) {
  const runs: Array<{ params: unknown[]; sql: string }> = [];
  const env = {
    DB: {
      prepare(sql: string) {
        let values: unknown[] = [];
        return {
          bind(...args: unknown[]) {
            values = args;
            return this;
          },
          async first() {
            if (sql.includes("FROM notify")) {
              if (sql.includes("status IN") && row.status !== "pending" && row.status !== "retry") return null;
              return row;
            }
            return null;
          },
          async run() {
            runs.push({ params: values, sql });
            return {};
          },
        };
      },
    },
  } as unknown as AppEnv;
  return { env, runs };
}
