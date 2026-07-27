import { defaultAppIconUrl } from "@homarr/definitions";

import { eq } from "../..";
import type { Database } from "../..";
import { apps } from "../../schema";

// Apps created without an icon, and with no name match in the icon repository,
// used to fall back to the dashboard-icons pack's `homarr.svg`. On a Muninn
// instance that renders the Homarr bird on every such app.
//
// Changing the constant only affects apps created from now on, so rewrite the
// rows that already carry it. Matched on the exact URL, so an app somebody
// deliberately pointed at that icon by hand is the only false positive, and it
// would have looked wrong anyway.
const legacyDefaultIconUrls = [
  "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/homarr.svg",
  "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/homarr.svg",
];

export async function migrateDefaultAppIconAsync(db: Database) {
  let migrated = 0;

  for (const legacyUrl of legacyDefaultIconUrls) {
    const rows = await db.select({ id: apps.id }).from(apps).where(eq(apps.iconUrl, legacyUrl));

    for (const row of rows) {
      await db.update(apps).set({ iconUrl: defaultAppIconUrl }).where(eq(apps.id, row.id));
      migrated += 1;
    }
  }

  if (migrated > 0) {
    console.log(`Repointed default app icons count="${migrated}"`);
  }
}
