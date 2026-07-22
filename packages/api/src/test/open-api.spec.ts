import { expect, test, vi } from "vitest";

import { openApiDocument } from "../open-api";

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

test("OpenAPI documentation should expose board automation endpoints", () => {
  const document = openApiDocument("https://muninn.dev");

  expect(document.info.version).toBe("1.1.0");
  expect(document.paths).toHaveProperty("/api/boards/{id}/settings");
  expect(document.paths).toHaveProperty("/api/boards/{id}/duplicate");
  expect(document.paths).toHaveProperty("/api/settings/board");
});
