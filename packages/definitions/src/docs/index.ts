import type { HomarrDocumentationPath } from "./homarr-docs-sitemap";

// Origin *plus* the Docusaurus baseUrl, with no trailing slash. The docs site is
// published to GitHub Pages under the repo path, so the "/muninn" segment belongs
// to the base and not to the paths - every HomarrDocumentationPath stays written
// as "/docs/..." exactly as the sitemap route.
export const documentationBaseUrl = "https://emkraan.github.io/muninn";

// Please use the method so the path can be checked!
export const createDocumentationLink = (
  path: HomarrDocumentationPath,
  hashTag?: `#${string}`,
  queryParams?: Record<string, string>,
) => {
  const url = `${documentationBaseUrl}${path}`;
  const params = queryParams ? `?${new URLSearchParams(queryParams)}` : "";
  return `${url}${params}${hashTag ?? ""}`;
};
