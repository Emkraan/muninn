import { documentationBaseUrl } from "@homarr/definitions";

import { eq, like } from "../..";
import type { Database } from "../..";
import { searchEngines } from "../../schema";

// Every documentation URL used to be built from a base that did not resolve:
// first upstream's homarr.dev, then briefly the GitHub repo root, which has no
// /docs or /search route. Changing the constant only fixes links rendered from
// code - the seeded "Muninn Docs" search engine persists its urlTemplate, and
// seedDefaultSearchEnginesAsync early-returns once any search engine exists, so
// an instance that has already booted keeps the dead template forever.
//
// Rewrite by URL prefix rather than by row name, because users can rename the
// row. Idempotent: rows already on the current base match no prefix, so a
// re-run (or a re-run after a SQLite to Postgres copy) is a no-op.
const legacyDocumentationBaseUrls = ["https://github.com/Emkraan/muninn", "https://homarr.dev"];

export async function migrateDocumentationUrlsAsync(db: Database) {
  let migrated = 0;

  for (const legacyBaseUrl of legacyDocumentationBaseUrls) {
    for (const route of ["/docs", "/search"]) {
      const legacyPrefix = `${legacyBaseUrl}${route}`;
      const rows = await db
        .select({ id: searchEngines.id, urlTemplate: searchEngines.urlTemplate })
        .from(searchEngines)
        .where(like(searchEngines.urlTemplate, `${legacyPrefix}%`));

      for (const row of rows) {
        // The LIKE above already excludes null, but urlTemplate is nullable.
        if (!row.urlTemplate) continue;
        await db
          .update(searchEngines)
          .set({ urlTemplate: `${documentationBaseUrl}${row.urlTemplate.slice(legacyBaseUrl.length)}` })
          .where(eq(searchEngines.id, row.id));
        migrated += 1;
      }
    }
  }

  if (migrated > 0) {
    console.log(`Repointed documentation search engine URLs count="${migrated}"`);
  }
}
