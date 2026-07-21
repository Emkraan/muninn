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
  },
  experimental__runtimeEnv: process.env,
});
