import type { User } from "@linkwarden/prisma/client";

type AdminCheckUser = Pick<User, "id" | "email" | "isAdmin">;

/**
 * The single source of truth for "is this user an instance administrator".
 *
 * Replaces Linkwarden's scattered `user.id === NEXT_PUBLIC_ADMIN` checks. An
 * admin is any of:
 *   - a user with the real DB role flag `isAdmin = true` (the primary mechanism);
 *   - the bootstrap owner id in NEXT_PUBLIC_ADMIN (kept for upgrade compat, so
 *     an existing single-admin instance keeps working before anyone is promoted);
 *   - an email listed in SUPER_ADMIN_EMAILS (a code/env-level break-glass list
 *     that never needs the DB, so an operator can never be locked out).
 *
 * The SSO-group -> admin mapping is layered on top by promoting matching users
 * to isAdmin at sign-in (see the auth callback), which then resolves here.
 */
export default function isServerAdmin(user: AdminCheckUser | null): boolean {
  if (!user) return false;

  if (user.isAdmin) return true;

  const bootstrapAdminId = Number(process.env.NEXT_PUBLIC_ADMIN || 0);
  if (bootstrapAdminId && user.id === bootstrapAdminId) return true;

  const superAdmins = (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (user.email && superAdmins.includes(user.email.toLowerCase())) return true;

  return false;
}
