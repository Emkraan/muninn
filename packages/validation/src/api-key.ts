import { z } from "zod/v4";

import type { GroupPermissionKey } from "@homarr/definitions";
import { groupPermissionKeys } from "@homarr/definitions";

import { zodEnumFromArray } from "./enums";

/**
 * Minimal, non-admin, read-only scope set assigned to a key when the caller
 * does not request specific scopes. Deliberately excludes any modify/create/admin
 * permission so an unscoped request can never mint a powerful key by accident.
 */
export const defaultApiKeyScopes: GroupPermissionKey[] = [
  "board-view-all",
  "app-use-all",
  "integration-use-all",
  "media-view-all",
];

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(128),
  scopes: z.array(zodEnumFromArray(groupPermissionKeys)).default(defaultApiKeyScopes),
  // Number of days until the key expires. null/undefined means the key never expires.
  expiresInDays: z.number().int().positive().max(3650).nullish(),
});

export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;

// Edit an existing key's scopes after creation. Same scope vocabulary as create;
// the secret is never rotated (only the scopes column changes).
export const apiKeyUpdateSchema = z.object({
  id: z.string(),
  scopes: z.array(zodEnumFromArray(groupPermissionKeys)).min(1),
});

export type ApiKeyUpdateInput = z.infer<typeof apiKeyUpdateSchema>;
