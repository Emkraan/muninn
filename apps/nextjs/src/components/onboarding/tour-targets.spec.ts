import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

// Tour steps are coupled to their targets by a bare string id, with nothing on
// either side to catch a mismatch. A step whose target never mounts does not
// fail loudly: the library keeps the tour active and keeps painting its
// full-screen overlay while rendering no popover, so the user is left on a
// dimmed, click-blocked page with no way to advance, skip or finish. These tests
// are the only thing holding that convention together.
//
// Two mismatches shipped before this existed: manage-welcome pointed at a nav
// link whose wrapper never emitted the attribute, and four nav entries carried
// ids matching no step at all.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "../..");

const collectSourceFilesAsync = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return await collectSourceFilesAsync(path);
      return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".spec.ts") ? [path] : [];
    }),
  );
  return files.flat();
};

const readAllSourcesAsync = async () => {
  const files = await collectSourceFilesAsync(srcDir);
  const contents = await Promise.all(files.map(async (file) => await readFile(file, "utf8")));
  return contents.join("\n");
};

const matchAll = (source: string, pattern: RegExp) => [...source.matchAll(pattern)].map((match) => match[1]!);

describe("onboarding tour targets", () => {
  test("every tour step id has a target that renders it", async () => {
    const source = await readAllSourcesAsync();

    const tourFiles = await Promise.all(
      ["manage-tour.tsx", "board-tour.tsx"].map(
        async (name) => await readFile(join(dirname(fileURLToPath(import.meta.url)), name), "utf8"),
      ),
    );
    const stepIds = tourFiles.flatMap((file) => matchAll(file, /^\s*id: "([a-z0-9-]+)",$/gm));

    // Targets reach the DOM either through the shared TourTarget component or,
    // for navigation entries, through the tour id carried on a nav link.
    const targetIds = new Set([
      ...matchAll(source, /<TourTarget\s+id="([a-z0-9-]+)"/g),
      ...matchAll(source, /"data-onboarding-tour-id":\s*"([a-z0-9-]+)"/g),
      ...matchAll(source, /data-tour-target="([a-z0-9-]+)"/g),
    ]);

    expect(stepIds.length).toBeGreaterThan(0);
    const orphanSteps = stepIds.filter((id) => !targetIds.has(id));
    expect(orphanSteps, `tour steps with no target: ${orphanSteps.join(", ")}`).toEqual([]);
  });

  test("no target is registered for an id that is not a tour step", async () => {
    const source = await readAllSourcesAsync();

    const tourFiles = await Promise.all(
      ["manage-tour.tsx", "board-tour.tsx"].map(
        async (name) => await readFile(join(dirname(fileURLToPath(import.meta.url)), name), "utf8"),
      ),
    );
    const stepIds = new Set(tourFiles.flatMap((file) => matchAll(file, /^\s*id: "([a-z0-9-]+)",$/gm)));

    const registeredIds = [
      ...matchAll(source, /<TourTarget\s+id="([a-z0-9-]+)"/g),
      ...matchAll(source, /"data-onboarding-tour-id":\s*"([a-z0-9-]+)"/g),
    ];

    const orphanTargets = [...new Set(registeredIds)].filter((id) => !stepIds.has(id));
    expect(orphanTargets, `targets matching no tour step: ${orphanTargets.join(", ")}`).toEqual([]);
  });

  test("the shared TourTarget is the only thing wrapping OnboardingTour.Target", async () => {
    // A raw OnboardingTour.Target does not emit data-tour-target, so the shell
    // cannot poll for it after a route change.
    const source = await readAllSourcesAsync();
    const rawUsages = matchAll(source, /<OnboardingTour\.Target\s+id="([a-z0-9-]+)"/g);
    expect(rawUsages, `raw OnboardingTour.Target usages: ${rawUsages.join(", ")}`).toEqual([]);
  });
});
