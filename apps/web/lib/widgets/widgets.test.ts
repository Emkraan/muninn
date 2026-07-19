import { describe, it, expect } from "vitest";
import { getBuiltinDescriptors, getBuiltinModule } from "./index";

describe("widget registry (built-ins)", () => {
  const descriptors = getBuiltinDescriptors();
  const expected = [
    "qbittorrent",
    "overseerr",
    "prowlarr",
    "prom-stat",
    "ping",
    "calendar",
  ];

  it("registers all six built-in widget types", () => {
    const ids = descriptors.map((d) => d.id).sort();
    expect(ids).toEqual([...expected].sort());
  });

  it("every built-in has a config schema and a positive refresh interval", () => {
    for (const d of descriptors) {
      expect(d.builtin).toBe(true);
      expect(d.configSchema).toBeTruthy();
      expect(d.configSchema.type).toBe("object");
      expect(Object.keys(d.configSchema.properties).length).toBeGreaterThan(0);
      expect(d.defaultRefreshIntervalSeconds).toBeGreaterThan(0);
    }
  });

  it("secret fields are marked x-secret so they render as passwords / are never echoed", () => {
    const qbit = getBuiltinModule("qbittorrent");
    expect(qbit?.configSchema.properties.password?.["x-secret"]).toBe(true);
    const overseerr = getBuiltinModule("overseerr");
    expect(overseerr?.configSchema.properties.apiKey?.["x-secret"]).toBe(true);
  });

  it("each built-in exposes a fetchStatus function", () => {
    for (const id of expected) {
      expect(typeof getBuiltinModule(id)?.fetchStatus).toBe("function");
    }
  });
});
