import { afterEach, describe, expect, it } from "vitest";
import { ssoEmailVerified } from "./ssoEmailVerified";

describe("ssoEmailVerified", () => {
  it("accepts a verified boolean claim", () => {
    expect(ssoEmailVerified({ email_verified: true })).toBe(true);
  });

  it("accepts the string 'true' (Cognito / userinfo style)", () => {
    expect(ssoEmailVerified({ email_verified: "true" })).toBe(true);
  });

  it("rejects an explicitly unverified claim (the core attack vector)", () => {
    expect(ssoEmailVerified({ email_verified: false })).toBe(false);
  });

  it("rejects the string 'false'", () => {
    expect(ssoEmailVerified({ email_verified: "false" })).toBe(false);
  });

  it("rejects an absent claim (fail closed)", () => {
    expect(ssoEmailVerified({ sub: "123", email: "a@b.com" })).toBe(false);
  });

  it("rejects a differently-named flag, e.g. Discord's `verified`", () => {
    expect(ssoEmailVerified({ verified: true })).toBe(false);
  });

  it("rejects a non-boolean truthy value such as 1", () => {
    expect(ssoEmailVerified({ email_verified: 1 })).toBe(false);
  });

  it("handles undefined / null profile", () => {
    expect(ssoEmailVerified(undefined)).toBe(false);
    expect(ssoEmailVerified(null)).toBe(false);
  });

  describe("Entra single-tenant trust (tid)", () => {
    const prev = process.env.AZURE_AD_TENANT_ID;
    afterEach(() => {
      if (prev === undefined) delete process.env.AZURE_AD_TENANT_ID;
      else process.env.AZURE_AD_TENANT_ID = prev;
    });

    it("accepts an Entra token from the configured tenant (no email_verified)", () => {
      process.env.AZURE_AD_TENANT_ID = "tenant-abc";
      expect(ssoEmailVerified({ tid: "tenant-abc", email: "a@b.com" })).toBe(
        true
      );
    });

    it("rejects an Entra token from a different tenant", () => {
      process.env.AZURE_AD_TENANT_ID = "tenant-abc";
      expect(ssoEmailVerified({ tid: "tenant-xyz" })).toBe(false);
    });

    it("rejects a tid when no tenant is configured (fail closed)", () => {
      delete process.env.AZURE_AD_TENANT_ID;
      expect(ssoEmailVerified({ tid: "tenant-abc" })).toBe(false);
    });
  });
});
