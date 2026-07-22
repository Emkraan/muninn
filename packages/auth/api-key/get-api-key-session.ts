import type { Session } from "next-auth";

import { createLogger } from "@homarr/core/infrastructure/logs";
import type { Database } from "@homarr/db";
import { eq } from "@homarr/db";
import { apiKeys } from "@homarr/db/schema";
import type { GroupPermissionKey } from "@homarr/definitions";
import { getPermissionsWithChildren } from "@homarr/definitions";

import { comparePasswordsAsync } from "../security";
import { createSessionAsync } from "../server";

const logger = createLogger({ module: "apiKeyAuth" });

// Legacy keys (created before scoping existed) have null/empty scopes. We keep
// them working as full-permission keys for backwards compatibility, but warn
// once per key id per process so operators are nudged to re-issue scoped keys.
// New keys always carry an explicit, non-empty scopes array.
const warnedLegacyKeyIds = new Set<string>();

const parseScopes = (raw: string | null): GroupPermissionKey[] | null => {
  if (raw === null || raw.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }
    return parsed.filter((value): value is GroupPermissionKey => typeof value === "string");
  } catch {
    // Malformed scopes are treated as a legacy full-permission key rather than
    // silently locking the key out.
    return null;
  }
};

/**
 * Validate an API key from the request header and return a session if valid.
 *
 * @param db - The database instance
 * @param apiKeyHeaderValue - The value of the ApiKey header (format: "id.token")
 * @param ipAddress - The IP address of the request (for logging)
 * @param userAgent - The user agent of the request (for logging)
 * @returns A session if the API key is valid, null otherwise
 */
export const getSessionFromApiKeyAsync = async (
  db: Database,
  apiKeyHeaderValue: string | null,
  ipAddress: string | null,
  userAgent: string,
): Promise<Session | null> => {
  if (apiKeyHeaderValue === null) {
    return null;
  }

  const [apiKeyId, apiKey] = apiKeyHeaderValue.split(".");

  if (!apiKeyId || !apiKey) {
    logger.warn("Failed to authenticate with api-key", { ipAddress, userAgent, reason: "API_KEY_INVALID_FORMAT" });
    return null;
  }

  const apiKeyFromDb = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.id, apiKeyId),
    columns: {
      id: true,
      apiKey: true,
      name: true,
      scopes: true,
      expiresAt: true,
    },
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
        },
      },
    },
  });

  if (!apiKeyFromDb) {
    logger.warn("Failed to authenticate with api-key", { ipAddress, userAgent, reason: "API_KEY_NOT_FOUND" });
    return null;
  }

  const isValid = await comparePasswordsAsync(apiKey, apiKeyFromDb.apiKey);

  if (!isValid) {
    logger.warn("Failed to authenticate with api-key", { ipAddress, userAgent, reason: "API_KEY_MISMATCH" });
    return null;
  }

  // Expiry check: a set expiresAt in the past means the key is no longer valid.
  if (apiKeyFromDb.expiresAt !== null && apiKeyFromDb.expiresAt.getTime() < Date.now()) {
    logger.warn("Failed to authenticate with api-key", {
      ipAddress,
      userAgent,
      reason: "API_KEY_EXPIRED",
      id: apiKeyFromDb.id,
    });
    return null;
  }

  const session = await createSessionAsync(db, apiKeyFromDb.user);

  const scopes = parseScopes(apiKeyFromDb.scopes);

  if (scopes === null) {
    // Legacy full-permission key: keep the owner's full permission set intact
    // but nudge operators to re-issue a scoped key.
    if (!warnedLegacyKeyIds.has(apiKeyFromDb.id)) {
      warnedLegacyKeyIds.add(apiKeyFromDb.id);
      logger.warn("Authenticated with a legacy unscoped api-key (deprecated)", {
        id: apiKeyFromDb.id,
        name: apiKeyFromDb.name,
        userId: apiKeyFromDb.user.id,
        reason: "API_KEY_LEGACY_UNSCOPED",
      });
    }
  } else {
    // Least privilege: the key can never exceed the owner's current permissions.
    // We expand the granted scopes with their implied children, then intersect
    // with the owner's live permission set.
    const grantedPermissions = new Set(getPermissionsWithChildren(scopes));
    session.user.permissions = session.user.permissions.filter((permission) => grantedPermissions.has(permission));
  }

  // Best-effort last-used stamp. Auth must never fail because this write fails.
  try {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKeyFromDb.id));
  } catch (error) {
    logger.warn("Failed to update api-key lastUsedAt", { id: apiKeyFromDb.id, error });
  }

  logger.info("Successfully authenticated with api-key", {
    name: apiKeyFromDb.user.name,
    id: apiKeyFromDb.user.id,
  });

  return session;
};
