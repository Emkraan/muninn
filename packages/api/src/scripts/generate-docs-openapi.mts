import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { documentationBaseUrl } from "@homarr/definitions";

import { openApiDocument } from "../open-api";

// Regenerates the OpenAPI document that the docs site's API Reference page
// renders (apps/docs/src/pages/api-reference.tsx reads it from /api/...).
//
// It is a committed artifact rather than a build step because apps/docs does not
// run the API. Re-run this with `pnpm -F @homarr/api codegen:openapi` whenever
// routes or the version change - otherwise the published reference silently
// drifts, which is how it ended up advertising version 1.1.0 and a dead
// muninn.dev externalDocs link.

// 7575 is the port the container serves on (see the README), so it is the right
// default for a self-hoster reading the reference.
const SELF_HOSTED_BASE_URL = "http://localhost:7575";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, "../../../../apps/docs/static/api/open-api-schema.json");

const document = openApiDocument(SELF_HOSTED_BASE_URL);

// x-logo is rendered by the docs site itself, so it has to resolve there rather
// than against the reader's own instance.
const info = document.info as typeof document.info & {
  "x-logo"?: { url: string; altText?: string };
};
info["x-logo"] = {
  url: `${documentationBaseUrl}/img/logo.png`,
  altText: "Muninn",
};

// Minified, matching how the artifact has always been committed. Nothing reads
// it as text; keeping it on one line keeps regeneration diffs small.
writeFileSync(outputPath, JSON.stringify(document));
console.log(`Wrote ${outputPath} (version ${info.version}, ${Object.keys(document.paths ?? {}).length} paths)`);
