import { describe, expect, it } from "vitest";
import { normalizeSettingsPayload } from "@/server/services/app/settings";

describe("settings payload", () => {
  it("uses the 5 minute default when timeout is empty", () => {
    expect(normalizeSettingsPayload({ timeout: null }).timeout).toBe(5);
    expect(normalizeSettingsPayload({ timeout: "" }).timeout).toBe(5);
  });
});
