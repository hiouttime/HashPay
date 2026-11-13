import { afterEach, describe, expect, it, vi } from "vitest";
import { appState } from "@/server/services/app";
import { sqliteEnv } from "./sqlite";

afterEach(() => {
  vi.restoreAllMocks();
});

function createEnv(configs: Map<string, string | null>) {
  const { env, sqlite } = sqliteEnv({ QUEUE_NOTIFY: {} as never, TGBOT_TOKEN: "token" });
  const insert = sqlite.prepare("INSERT INTO configs(key, value, updated_at) VALUES(?, ?, 0)");
  for (const [key, value] of configs) insert.run(key, value);
  const config = (key: string) => (sqlite.prepare("SELECT value FROM configs WHERE key = ?").get(key) as { value: string } | undefined)?.value;
  return Object.assign(env, { config });
}

describe("app state", () => {
  it("uses cached bot username after setup", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const configs = new Map<string, string | null>([
      ["admin_id", "123"],
      ["bot_username", "HashPayBot"],
      ["domain", "https://hashpay.test"],
      ["bot_secret", "secret"],
      ["title", "Demo Pay"],
    ]);

    const status = await appState(createEnv(configs));

    expect(status.ready).toBe(true);
    expect(status.title).toBe("Demo Pay");
    expect(status.username).toBe("HashPayBot");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fills missing bot username cache once", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      result: { username: "FreshHashPayBot" },
    })));
    const configs = new Map<string, string | null>([
      ["admin_id", "123"],
      ["domain", "https://hashpay.test"],
      ["bot_secret", "secret"],
    ]);

    const env = createEnv(configs);
    const status = await appState(env);

    expect(status.username).toBe("FreshHashPayBot");
    expect(status.title).toBe("HashPay");
    expect(env.config("bot_username")).toBe("FreshHashPayBot");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
