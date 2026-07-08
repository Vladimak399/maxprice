import { afterEach, describe, expect, it } from "vitest";
import { getMaxAuthHeader } from "../src/max/client";

describe("MAX auth header", () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });

  it("uses raw token by default", () => {
    delete process.env.MAX_AUTH_SCHEME;
    expect(getMaxAuthHeader("token")).toBe("token");
  });

  it("accepts lower-case bearer auth scheme", () => {
    process.env.MAX_AUTH_SCHEME = "bearer";
    expect(getMaxAuthHeader("token")).toBe("Bearer token");
  });
});
