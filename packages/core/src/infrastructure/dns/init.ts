import { DnsCacheManager } from "dns-caching";

import { createLogger } from "@homarr/core/infrastructure/logs";

import { dnsEnv } from "./env";

// Add global type augmentation for muninn
declare global {
  var muninn: {
    dnsCacheManager?: DnsCacheManager;
    // add other properties if needed
  };
}

const logger = createLogger({ module: "dns" });

// Initialize global.muninn if not present
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
global.muninn ??= {};
global.muninn.dnsCacheManager ??= new DnsCacheManager({
  cacheMaxEntries: 1000,
  forceMinTtl: 5 * 60 * 1000, // 5 minutes
  logger,
});

if (dnsEnv.ENABLE_DNS_CACHING) {
  global.muninn.dnsCacheManager.initialize();
}
