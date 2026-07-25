import { expect, test, vi } from "vitest";

import { openApiDocument, openApiVersion } from "../open-api";

vi.mock("@homarr/auth", () => ({}));
// open-api.ts imports API_KEY_HEADER_NAME from this subpath, which otherwise
// pulls a server-env access and fails the import under a jsdom test env
// (leaving this guardrail running 0 tests). Mock it so the suite always loads.
vi.mock("@homarr/auth/api-key", () => ({ API_KEY_HEADER_NAME: "x-api-key" }));

test("OpenAPI documentation should be generated", () => {
  // Arrange
  const base = "https://muninn.dev";

  // Act
  const act = () => openApiDocument(base);

  // Assert
  expect(act).not.toThrow();
});

test("OpenAPI documentation version tracks the derived app version", () => {
  const document = openApiDocument("https://muninn.dev");

  // The version must be derived from the real source (VERSION file / build env),
  // never a hand-edited literal that can silently drift from the shipped build.
  expect(document.info.version).toBe(openApiVersion);
  expect(openApiVersion).not.toBe("1.1.0");
  expect(openApiVersion).toMatch(/^\d+\.\d+\.\d+/);
});

test("OpenAPI documentation should carry Muninn branding", () => {
  const base = "https://muninn.dev";
  const document = openApiDocument(base);

  expect(document.info.title).toBe("Muninn API");
  expect(document.info.description).toBeTruthy();
  expect(document.info.contact).toEqual({
    name: "Muninn",
    url: "https://github.com/Emkraan/muninn",
  });
  expect(document.info.license?.name).toBe("Apache-2.0");
  expect((document.info as { "x-logo"?: { url: string } })["x-logo"]?.url).toBe(`${base}/logo/logo.png`);
});

test("OpenAPI documentation should expose board automation endpoints", () => {
  const document = openApiDocument("https://muninn.dev");

  expect(document.paths).toHaveProperty("/api/boards/{id}/settings");
  expect(document.paths).toHaveProperty("/api/boards/{id}/duplicate");
  expect(document.paths).toHaveProperty("/api/settings/board");
});

test("OpenAPI documentation should expose the scoped API keys endpoints", () => {
  const document = openApiDocument("https://muninn.dev");

  expect(document.paths).toHaveProperty("/api/api-keys");
  expect(document.paths?.["/api/api-keys"]).toHaveProperty("get");
  expect(document.paths?.["/api/api-keys"]).toHaveProperty("post");
  expect(document.paths).toHaveProperty("/api/api-keys/{apiKeyId}");

  // The create body must surface the scoped-key fields.
  const createSchema = (
    document.paths?.["/api/api-keys"]?.post?.requestBody as
      | { content?: { "application/json"?: { schema?: { properties?: Record<string, unknown> } } } }
      | undefined
  )?.content?.["application/json"]?.schema?.properties;
  expect(createSchema).toHaveProperty("name");
  expect(createSchema).toHaveProperty("scopes");
  expect(createSchema).toHaveProperty("expiresInDays");
});

test("OpenAPI documentation should expose integration and group read endpoints", () => {
  const document = openApiDocument("https://muninn.dev");

  expect(document.paths).toHaveProperty("/api/integrations");
  expect(document.paths).toHaveProperty("/api/integrations/{id}");
  expect(document.paths).toHaveProperty("/api/groups");
  expect(document.paths).toHaveProperty("/api/groups/{id}");
});
