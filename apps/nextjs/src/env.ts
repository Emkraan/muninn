import { z } from "zod/v4";

import { createBooleanSchema, createEnv } from "@homarr/core/infrastructure/env";

export const env = createEnv({
  server: {
    UNSAFE_ENABLE_MOCK_INTEGRATION: createBooleanSchema(false),
    DEMO_MODE: createBooleanSchema(false),
    DEMO_READ_ONLY: createBooleanSchema(true),
    // Optional attribution shown in the bottom-left footer pill (e.g. your organization).
    // Empty by default so the public build stays brand-agnostic; a deployment
    // sets it at runtime to attribute the build.
    BRAND_ATTRIBUTION: z.string().optional(),
    // Optional logo for that pill: an image URL or a data: URI. Kept out of the
    // agnostic public image; a deployment supplies its own mark (e.g. a small
    // data-URI so no external request or baked-in asset is needed).
    BRAND_ATTRIBUTION_LOGO: z.string().optional(),
  },
  experimental__runtimeEnv: process.env,
});
