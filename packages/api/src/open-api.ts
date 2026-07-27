import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { generateOpenApiDocument } from "trpc-to-openapi";

import { API_KEY_HEADER_NAME } from "@homarr/auth/api-key";
import { createDocumentationLink } from "@homarr/definitions";

import { apiKeysRouter } from "./router/apiKeys";
import { appRouter } from "./router/app";
import { boardRouter } from "./router/board";
import { groupRouter } from "./router/group";
import { infoRouter } from "./router/info";
import { integrationRouter } from "./router/integration/integration-router";
import { inviteRouter } from "./router/invite";
import { serverSettingsRouter } from "./router/serverSettings";
import { userRouter } from "./router/user";
import { createTRPCRouter } from "./trpc";

/**
 * Single source of truth for the documented API version.
 *
 * Resolution order (drift-proof, so the doc version always tracks the shipped
 * build instead of a hand-edited literal):
 *   1. HOMARR_VERSION env - injected at build time from the repo-root VERSION
 *      file (see next.config.ts / .github/workflows/build-and-deploy.yml).
 *   2. The repo-root VERSION file read directly - covers dev servers, tests and
 *      any non-Next consumer of this module.
 *   3. A neutral fallback if neither is resolvable.
 */
function resolveAppVersion(): string {
  const envVersion = process.env.HOMARR_VERSION?.trim();
  if (envVersion && envVersion !== "unknown") {
    return envVersion;
  }

  try {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    // packages/api/src -> repo root
    const version = readFileSync(join(moduleDir, "..", "..", "..", "VERSION"), "utf8").trim();
    if (version.length > 0) {
      return version;
    }
  } catch {
    // VERSION file not resolvable in this runtime (e.g. bundled) - fall through.
  }

  return "0.0.0";
}

export const openApiVersion = resolveAppVersion();

export const openApiRouter = createTRPCRouter({
  apiKeysRouter,
  appRouter,
  boardRouter,
  groupRouter,
  infoRouter,
  integrationRouter,
  inviteRouter,
  serverSettingsRouter,
  userRouter,
});

export const openApiDocument = (base: string) => {
  const document = generateOpenApiDocument(openApiRouter, {
    title: "Muninn API",
    description:
      "REST API for automating Muninn, a self-hosted dashboard for your homelab and server fleet. " +
      "The REST surface covers boards, apps, users, invites, server settings, API keys, integrations and groups. " +
      "The broader automation surface (Docker, Kubernetes, logs, widgets and more) is available through the Model Context Protocol (MCP) endpoint at /api/mcp.",
    version: openApiVersion,
    contact: {
      name: "Muninn",
      url: "https://github.com/Emkraan/muninn",
    },
    license: {
      name: "Apache-2.0",
      url: "https://github.com/Emkraan/muninn/blob/main/LICENSE",
    },
    baseUrl: base,
    docsUrl: createDocumentationLink("/api-reference"),
    securitySchemes: {
      apikey: {
        type: "apiKey",
        name: API_KEY_HEADER_NAME,
        description: "API key which can be obtained in the Muninn administration dashboard",
        in: "header",
      },
    },
  });

  // Scalar / Redoc render `info["x-logo"].url` as the reference logo. This is a
  // spec extension, so it is attached after generation rather than via options.
  const info = document.info as typeof document.info & {
    "x-logo"?: { url: string; altText?: string };
  };
  info["x-logo"] = {
    url: `${base}/logo/logo.png`,
    altText: "Muninn",
  };

  return document;
};
