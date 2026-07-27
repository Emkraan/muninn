/* eslint-disable no-restricted-syntax */
import { describe, expect, test } from "vitest";

import { createDocumentationLink, documentationBaseUrl } from "../docs";
import type { MuninnDocumentationPath } from "../docs/muninn-docs-sitemap";

describe("createDocumentationLink should generate correct URLs", () => {
  test.each([
    ["/docs/getting-started", undefined, undefined, `${documentationBaseUrl}/docs/getting-started`],
    ["/about-us", undefined, undefined, `${documentationBaseUrl}/about-us`],
    [
      "/docs/widgets/weather",
      "#configuration",
      undefined,
      `${documentationBaseUrl}/docs/widgets/weather#configuration`,
    ],
    [
      "/docs/advanced/environment-variables",
      undefined,
      { lang: "en" },
      `${documentationBaseUrl}/docs/advanced/environment-variables?lang=en`,
    ],
    [
      "/docs/widgets/bookmarks",
      "#sorting",
      { lang: "fr", theme: "dark" },
      `${documentationBaseUrl}/docs/widgets/bookmarks?lang=fr&theme=dark#sorting`,
    ],
  ] satisfies [MuninnDocumentationPath, `#${string}` | undefined, Record<string, string> | undefined, string][])(
    "should create correct URL for path %s with hash %s and params %o",
    (path, hashTag, queryParams, expected) => {
      expect(createDocumentationLink(path, hashTag, queryParams)).toBe(expected);
    },
  );
});

describe("createDocumentationLink parameter validation", () => {
  test("should work with only path parameter", () => {
    const result = createDocumentationLink("/docs/getting-started");
    expect(result).toBe(`${documentationBaseUrl}/docs/getting-started`);
  });

  test("should work with path and hashtag", () => {
    const result = createDocumentationLink("/docs/getting-started", "#installation");
    expect(result).toBe(`${documentationBaseUrl}/docs/getting-started#installation`);
  });

  test("should work with path and query params", () => {
    const result = createDocumentationLink("/docs/getting-started", undefined, { version: "1.0" });
    expect(result).toBe(`${documentationBaseUrl}/docs/getting-started?version=1.0`);
  });
});

describe("documentationBaseUrl", () => {
  test("should carry the Docusaurus baseUrl and no trailing slash", () => {
    // A trailing slash here would double up against every path's leading slash.
    expect(documentationBaseUrl.endsWith("/")).toBe(false);
    expect(new URL(documentationBaseUrl).pathname).toBe("/muninn");
  });
});
