import { describe, expect, test } from "vitest";

import { resolveOidcConfig } from "../oidc/presets";

// Regression guard: a discovery-based provider MUST resolve an issuer. A
// provider built with `wellKnown` but no `issuer` makes @auth/core's
// assertConfig throw InvalidEndpoints, which 500s the entire /api/auth/*
// surface (breaking every sign-in AND sign-out).
describe("resolveOidcConfig issuer presence", () => {
  test("microsoft preset supplies both an issuer and a discovery URL", () => {
    const resolved = resolveOidcConfig({ providerType: "microsoft", tenant: "tenant-123" });
    expect(resolved.issuer).toBe("https://login.microsoftonline.com/tenant-123/v2.0");
    expect(resolved.discoveryUrl).toContain("/.well-known/openid-configuration");
  });

  test("google preset supplies an issuer", () => {
    expect(resolveOidcConfig({ providerType: "google" }).issuer).toBe("https://accounts.google.com");
  });

  test("admin-supplied issuer always wins over the preset", () => {
    const resolved = resolveOidcConfig({
      providerType: "microsoft",
      tenant: "tenant-123",
      issuer: "https://login.microsoftonline.com/custom/v2.0",
    });
    expect(resolved.issuer).toBe("https://login.microsoftonline.com/custom/v2.0");
  });

  test("issuer-based providers (okta/keycloak/authentik) pass the admin issuer through", () => {
    expect(resolveOidcConfig({ providerType: "okta", issuer: "https://acme.okta.com" }).issuer).toBe(
      "https://acme.okta.com",
    );
  });
});
